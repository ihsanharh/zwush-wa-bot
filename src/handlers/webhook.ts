import { Hono } from "hono";
import type { OrderNotificationPayload } from "../types";
import type { AdminGroupLogger } from "./adminLogger";
import type { StateManager } from "../state";
import {
    formatStatusNotification,
    formatPlayerNotFoundRetry,
    formatPlayerNotFoundMaxExceeded,
    type Language
} from "../i18n";

export { formatStatusNotification, formatPlayerNotFoundRetry, formatPlayerNotFoundMaxExceeded };

export interface BotMessageSender {
    sendMessage(jid: string, text: string): Promise<void>;
}

export interface WebhookAppOptions {
    sender: BotMessageSender;
    adminLogger?: AdminGroupLogger;
    qrDeleter?: (jid: string, key?: any) => Promise<void>;
    getBuyerLanguage?: (jid: string) => Language;
    stateManager?: StateManager;
}

export function createWebhookApp(
    senderOrOptions: BotMessageSender | WebhookAppOptions,
    legacyAdminGroupJid?: string
): Hono {
    const app = new Hono();

    let sender: BotMessageSender;
    let adminLogger: AdminGroupLogger | undefined;
    let qrDeleter: ((jid: string, key?: any) => Promise<void>) | undefined;
    let getBuyerLanguage: ((jid: string) => Language) | undefined;
    let stateManager: StateManager | undefined;

    if ("sender" in senderOrOptions) {
        sender = senderOrOptions.sender;
        adminLogger = senderOrOptions.adminLogger;
        qrDeleter = senderOrOptions.qrDeleter;
        getBuyerLanguage = senderOrOptions.getBuyerLanguage;
        stateManager = senderOrOptions.stateManager;
    } else {
        sender = senderOrOptions;
    }

    app.post("/webhook/order-update", async (c) => {
        try {
            const body = (await c.req.json()) as OrderNotificationPayload;

            if (!body.platformUserId || !body.orderId || !body.status) {
                return c.json({ success: false, message: "Missing required fields" }, 400);
            }

            // Ignore stale notifications older than 5 minutes (300 seconds)
            if (body.timestamp && (Date.now() - body.timestamp > 300000)) {
                console.log(`[Webhook Ignored] Stale notification for order ${body.orderId} (${Math.round((Date.now() - body.timestamp) / 1000)}s old > 300s limit)`);
                return c.json({ success: true, ignored: true, reason: "Stale notification" });
            }

            // 1. Update Admin Group Logger if configured
            if (adminLogger) {
                await adminLogger.updateOrderStatus(body.orderId, body.status, {
                    failureReason: body.message,
                    itemName: body.itemName,
                    gamertag: body.gamertag,
                    platformUserId: body.platformUserId
                });
            }

            // 2. Delete buyer's QR code image when payment received, expired, or cancelled
            if (body.status === "QUEUED" || body.status === "EXPIRED" || body.status === "CANCELLED") {
                if (stateManager?.clearActiveOrderId) {
                    stateManager.clearActiveOrderId(body.platformUserId);
                }
                if (qrDeleter) {
                    try {
                        await qrDeleter(body.platformUserId);
                    } catch (err: unknown) {
                        console.error("[QR Delete Error]:", err);
                    }
                }
            }

            // 3. Dispatch alert to admin group if insufficient tokens
            if (body.status === "INSUFFICIENT_TOKENS" && adminLogger) {
                try {
                    await adminLogger.notifyInsufficientTokens({
                        orderId: body.orderId,
                        itemName: body.itemName,
                        gamertag: body.gamertag
                    });
                } catch (err: unknown) {
                    console.error("[Admin Group Token Alert Error]:", err);
                }
            }

            // 4. Send notification to buyer in their chosen language
            const buyerLang = getBuyerLanguage ? getBuyerLanguage(body.platformUserId) : "id";

            if (body.status === "FAILED") {
                const msgLower = (body.message || "").toLowerCase();
                const isPlayerNotFound =
                    msgLower.includes("can't find a player named") ||
                    msgLower.includes("cant find a player named") ||
                    msgLower.includes("player named") ||
                    msgLower.includes("player not found");

                if (isPlayerNotFound && stateManager) {
                    const attempts = stateManager.incrementOrderRetryAttempts(body.orderId);
                    if (attempts < 3) {
                        stateManager.setRetryOrder(body.platformUserId, {
                            orderId: body.orderId,
                            itemName: body.itemName,
                            oldGamertag: body.gamertag,
                            attempts
                        });
                        const retryText = formatPlayerNotFoundRetry(
                            body.orderId,
                            body.itemName,
                            body.gamertag,
                            attempts,
                            3,
                            buyerLang
                        );
                        await sender.sendMessage(body.platformUserId, retryText);
                        return c.json({ success: true, retry: true, attempt: attempts });
                    } else {
                        stateManager.clearRetryOrder(body.platformUserId);
                        stateManager.setLastFailedOrder(body.platformUserId, {
                            orderId: body.orderId,
                            itemName: body.itemName,
                            gamertag: body.gamertag,
                            attempts
                        });
                        const maxText = formatPlayerNotFoundMaxExceeded(
                            body.orderId,
                            body.itemName,
                            body.gamertag,
                            buyerLang
                        );
                        await sender.sendMessage(body.platformUserId, maxText);
                        return c.json({ success: true, retry: false, maxAttemptsReached: true });
                    }
                }

                const isDelayedPayment =
                    msgLower.includes("kedaluwarsa") ||
                    msgLower.includes("terlambat") ||
                    msgLower.includes("delayed");

                if (isDelayedPayment) {
                    if (adminLogger) {
                        try {
                            await adminLogger.notifyDelayedPayment({
                                orderId: body.orderId,
                                itemName: body.itemName || "Item",
                                gamertag: body.gamertag || "-",
                                failureReason: body.message
                            });
                        } catch (err: unknown) {
                            console.error("[Delayed Payment Alert Error]:", err);
                        }
                    }

                    const buyerNotice = buyerLang === "en"
                        ? `⚠️ *PAYMENT RECEIVED (AWAITING VERIFICATION)*\n\nHello! We have received your payment for order *#${body.orderId}* (*${body.itemName || "Item"}*).\n\nHowever, because the payment notification arrived after the QR time limit, your order is currently awaiting admin verification before in-game gifting.\n\nDon't worry, your payment is 100% safe! Our admin will process your order shortly. 😊\n_Type */support* if you need live chat assistance._`
                        : `⚠️ *PEMBAYARAN DITERIMA (MENUNGGU KONFIRMASI)*\n\nHalo kak! Pembayaran kamu untuk pesanan *#${body.orderId}* (*${body.itemName || "Item"}*) telah kami terima 🎉\n\nNamun karena notifikasi transfer baru masuk setelah batas waktu QRIS, pesanan kakak saat ini sedang menunggu verifikasi admin untuk diproses pengirimannya.\n\nTenang kak, uang kakak 100% aman! Admin kami akan segera memproses pesanan kakak ya. 😊\n_Ketik */support* jika butuh bantuan live chat admin._`;

                    await sender.sendMessage(body.platformUserId, buyerNotice);
                    return c.json({ success: true, delayedPayment: true });
                }
            }

            const formattedText = formatStatusNotification(body, buyerLang);
            await sender.sendMessage(body.platformUserId, formattedText);

            return c.json({ success: true });
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("[Webhook Error]:", errorMsg);
            return c.json({ success: false, error: errorMsg }, 500);
        }
    });

    return app;
}
