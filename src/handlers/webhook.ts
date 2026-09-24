import { Hono } from "hono";
import type { OrderNotificationPayload } from "../types";
import type { AdminGroupLogger } from "./adminLogger";
import { formatStatusNotification, type Language } from "../i18n";

export { formatStatusNotification };

export interface BotMessageSender {
    sendMessage(jid: string, text: string): Promise<void>;
}

export interface WebhookAppOptions {
    sender: BotMessageSender;
    adminPhone: string;
    adminLogger?: AdminGroupLogger;
    qrDeleter?: (jid: string, key?: any) => Promise<void>;
    getBuyerLanguage?: (jid: string) => Language;
}

export function createWebhookApp(
    senderOrOptions: BotMessageSender | WebhookAppOptions,
    maybeAdminPhone?: string
): Hono {
    const app = new Hono();

    let sender: BotMessageSender;
    let adminPhone: string;
    let adminLogger: AdminGroupLogger | undefined;
    let qrDeleter: ((jid: string, key?: any) => Promise<void>) | undefined;
    let getBuyerLanguage: ((jid: string) => Language) | undefined;

    if ("sender" in senderOrOptions) {
        sender = senderOrOptions.sender;
        adminPhone = senderOrOptions.adminPhone;
        adminLogger = senderOrOptions.adminLogger;
        qrDeleter = senderOrOptions.qrDeleter;
        getBuyerLanguage = senderOrOptions.getBuyerLanguage;
    } else {
        sender = senderOrOptions;
        adminPhone = maybeAdminPhone || "";
    }

    app.post("/webhook/order-update", async (c) => {
        try {
            const body = (await c.req.json()) as OrderNotificationPayload;

            if (!body.platformUserId || !body.orderId || !body.status) {
                return c.json({ success: false, message: "Missing required fields" }, 400);
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

            // 2. Delete buyer's QR code image when payment received or expired
            if (body.status === "QUEUED" || body.status === "EXPIRED") {
                if (qrDeleter) {
                    try {
                        await qrDeleter(body.platformUserId);
                    } catch (err: unknown) {
                        console.error("[QR Delete Error]:", err);
                    }
                }
            }

            // 3. Dispatch alert to admin group (with mention tag) if insufficient tokens
            if (body.status === "INSUFFICIENT_TOKENS" && adminLogger) {
                try {
                    await adminLogger.notifyInsufficientTokens({
                        orderId: body.orderId,
                        itemName: body.itemName,
                        gamertag: body.gamertag,
                        adminPhone
                    });
                } catch (err: unknown) {
                    console.error("[Admin Group Token Alert Error]:", err);
                }
            }

            // 4. Send notification to buyer in their chosen language
            const buyerLang = getBuyerLanguage ? getBuyerLanguage(body.platformUserId) : "id";
            const formattedText = formatStatusNotification(body, adminPhone, buyerLang);
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
