import { Hono } from "hono";
import type { OrderNotificationPayload } from "../types";
import type { AdminGroupLogger } from "./adminLogger";
import type { StateManager } from "../state";
import { clearPosterCache } from "../poster";
import {
    formatStatusNotification,
    formatPlayerNotFoundRetry,
    formatPlayerNotFoundMaxExceeded,
    t,
    type Language
} from "../i18n";
import {
    buildUserOrderFailureButtons,
    buildOrderSuccessButtons,
    buildOrderExpiredButtons,
    buildOrderCancelledButtons,
    buildQuickReplyPayload
} from "../utils/interactiveBuilders";

export { formatStatusNotification, formatPlayerNotFoundRetry, formatPlayerNotFoundMaxExceeded };

export interface BotMessageSender {
    sendMessage(jid: string, text: string): Promise<void>;
    sendButtons?(jid: string, payload: any): Promise<any>;
}

async function sendFailureLiveChatButtons(
    sender: BotMessageSender,
    platformUserId: string,
    orderId: string,
    failureReason: string | undefined,
    lang: Language
): Promise<void> {
    if (!sender.sendButtons) return;
    try {
        const failBtns = buildUserOrderFailureButtons(orderId, failureReason, lang);
        await sender.sendButtons(platformUserId, failBtns);
    } catch (btnErr) {
        console.warn(`[Webhook] Failed to send live chat button for #${orderId}:`, btnErr);
    }
}

export interface WebhookAppOptions {
    sender: BotMessageSender;
    adminLogger?: AdminGroupLogger;
    qrDeleter?: (jid: string, key?: any) => Promise<void>;
    getBuyerLanguage?: (jid: string) => Language;
    stateManager?: StateManager;
    onCatalogSynced?: () => void;
}

export function createWebhookApp(
    senderOrOptions: BotMessageSender | WebhookAppOptions,
    _legacyAdminGroupJid?: string
): Hono {
    const app = new Hono();

    let sender: BotMessageSender;
    let adminLogger: AdminGroupLogger | undefined;
    let qrDeleter: ((jid: string, key?: any) => Promise<void>) | undefined;
    let getBuyerLanguage: ((jid: string) => Language) | undefined;
    let stateManager: StateManager | undefined;
    let onCatalogSynced: () => void = clearPosterCache;

    if ("sender" in senderOrOptions) {
        sender = senderOrOptions.sender;
        adminLogger = senderOrOptions.adminLogger;
        qrDeleter = senderOrOptions.qrDeleter;
        getBuyerLanguage = senderOrOptions.getBuyerLanguage;
        stateManager = senderOrOptions.stateManager;
        if (senderOrOptions.onCatalogSynced) {
            onCatalogSynced = senderOrOptions.onCatalogSynced;
        }
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

            // 2. Delete buyer's QR code image when payment received, expired, cancelled, failed, or succeeded
            if (body.status === "QUEUED" || body.status === "EXPIRED" || body.status === "CANCELLED" || body.status === "SUCCESS" || body.status === "FAILED") {
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

            // 4. If silent mode is requested, skip buyer notification entirely
            if (body.silent) {
                console.log(`[Webhook Silent] Skipping buyer notification for order #${body.orderId} (${body.status})`);
                return c.json({ success: true, silent: true });
            }

            // 5. Send notification to buyer in their chosen language
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

                        await sendFailureLiveChatButtons(sender, body.platformUserId, body.orderId, body.message, buyerLang);
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

                    const buyerNotice = t("notification.DELAYED_PAYMENT", buyerLang, {
                        orderId: body.orderId,
                        itemName: body.itemName || "Item"
                    });

                    await sender.sendMessage(body.platformUserId, buyerNotice);
                    return c.json({ success: true, delayedPayment: true });
                }

                const isUpgradeIneligible =
                    msgLower.includes("requires 22 tokens") ||
                    msgLower.includes("not eligible for upgrade") ||
                    msgLower.includes("ineligible_for_upgrade") ||
                    msgLower.includes("does not have hive+ rank");

                if (isUpgradeIneligible) {
                    const buyerNotice = t("notification.INELIGIBLE_UPGRADE", buyerLang, {
                        orderId: body.orderId,
                        gamertag: body.gamertag || "-",
                        itemName: body.itemName || "Hive+ to Ultimate Upgrade"
                    });

                    await sender.sendMessage(body.platformUserId, buyerNotice);
                    await sendFailureLiveChatButtons(sender, body.platformUserId, body.orderId, body.message, buyerLang);
                    return c.json({ success: true, ineligibleUpgrade: true });
                }
            }

            const formattedText = formatStatusNotification(body, buyerLang);
            if (body.status === "SUCCESS" && sender.sendButtons) {
                try {
                    const hasDefaultGt = Boolean(stateManager?.getDefaultGamertag?.(body.platformUserId));
                    await sender.sendButtons(
                        body.platformUserId,
                        buildOrderSuccessButtons(formattedText, buyerLang, body.gamertag, hasDefaultGt)
                    );
                } catch (btnErr) {
                    console.warn(`[Webhook] Failed to send success buttons for #${body.orderId}, falling back to text:`, btnErr);
                    await sender.sendMessage(body.platformUserId, formattedText);
                }
            } else if (body.status === "EXPIRED" && sender.sendButtons) {
                try {
                    await sender.sendButtons(body.platformUserId, buildOrderExpiredButtons(formattedText, buyerLang));
                } catch (btnErr) {
                    console.warn(`[Webhook] Failed to send expired buttons for #${body.orderId}, falling back to text:`, btnErr);
                    await sender.sendMessage(body.platformUserId, formattedText);
                }
            } else if (body.status === "CANCELLED" && sender.sendButtons) {
                try {
                    await sender.sendButtons(body.platformUserId, buildOrderCancelledButtons(formattedText, buyerLang));
                } catch (btnErr) {
                    console.warn(`[Webhook] Failed to send cancelled buttons for #${body.orderId}, falling back to text:`, btnErr);
                    await sender.sendMessage(body.platformUserId, formattedText);
                }
            } else {
                await sender.sendMessage(body.platformUserId, formattedText);
            }

            if (body.status === "FAILED") {
                await sendFailureLiveChatButtons(sender, body.platformUserId, body.orderId, body.message, buyerLang);
            }

            return c.json({ success: true });
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("[Webhook Error]:", errorMsg);
            return c.json({ success: false, error: errorMsg }, 500);
        }
    });

    app.post("/webhook/catalog-sync", async (c) => {
        try {
            const body = (await c.req.json()) as {
                success: boolean;
                updated?: number;
                added?: string[];
                tokens?: number;
                costumeTokens?: number;
                error?: string;
                notifyJid?: string;
                source?: string;
                timestamp?: number;
            };

            if (typeof body.success !== "boolean") {
                return c.json({ success: false, message: "Missing required field: success" }, 400);
            }

            if (body.timestamp && (Date.now() - body.timestamp > 300000)) {
                console.log(`[Webhook Ignored] Stale catalog sync notification (${Math.round((Date.now() - body.timestamp) / 1000)}s old > 300s limit)`);
                return c.json({ success: true, ignored: true, reason: "Stale notification" });
            }

            const targetJid = body.notifyJid || adminLogger?.getAdminGroupJid() || adminLogger?.getLogGroupJid();

            if (body.success) {
                onCatalogSynced();

                const addedItems = Array.isArray(body.added) ? body.added : [];
                let msg = `✅ *SINKRONISASI KATALOG SELESAI!* 🎉\n\n`;
                msg += `• Total Item Katalog: *${body.updated ?? 0} item*\n`;
                if (typeof body.tokens === "number") {
                    msg += `• Sisa Token Gift: *${body.tokens} Token*`;
                    if (typeof body.costumeTokens === "number") {
                        msg += ` • Costume: *${body.costumeTokens} Token*`;
                    }
                    msg += `\n`;
                }
                if (addedItems.length > 0) {
                    msg += `\n🆕 *Item Baru Ditemukan (${addedItems.length}):*\n`;
                    const shown = addedItems.slice(0, 15);
                    for (const name of shown) {
                        msg += `• ${name}\n`;
                    }
                    if (addedItems.length > 15) {
                        msg += `• ...dan ${addedItems.length - 15} lainnya\n`;
                    }
                } else {
                    msg += `\nℹ️ _Tidak ada item baru; daftar item & harga yang ada telah diperbarui._\n`;
                }
                msg += `\n🖼️ Cache poster katalog otomatis di-refresh.`;

                if (targetJid) {
                    if (sender.sendButtons) {
                        try {
                            const payload = buildQuickReplyPayload(msg, [
                                { id: "btn_admin_panel", text: t("buttons.adminPanel", "id") }
                            ]);
                            await sender.sendButtons(targetJid, payload);
                        } catch (btnErr) {
                            console.warn("[Webhook] Failed to send catalog sync buttons, falling back to text:", btnErr);
                            await sender.sendMessage(targetJid, msg);
                        }
                    } else {
                        await sender.sendMessage(targetJid, msg);
                    }
                }
            } else {
                const msg = `❌ *SINKRONISASI KATALOG GAGAL*\n\nKendala: *${body.error || "Unknown error"}*`;
                if (targetJid) {
                    await sender.sendMessage(targetJid, msg);
                }
            }

            return c.json({ success: true, notified: Boolean(targetJid) });
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("[Catalog Sync Webhook Error]:", errorMsg);
            return c.json({ success: false, error: errorMsg }, 500);
        }
    });

    return app;
}
