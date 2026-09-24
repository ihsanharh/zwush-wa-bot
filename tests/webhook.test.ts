import { describe, expect, it, mock } from "bun:test";
import { createWebhookApp } from "../src/handlers/webhook";

describe("Webhook Server", () => {
    it("should accept valid payload and dispatch WhatsApp notification", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        const mockSender = {
            sendMessage: mock(async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            })
        };

        const app = createWebhookApp(mockSender, "628123456789");

        const payload = {
            orderId: "ord_abc",
            platform: "whatsapp",
            platformUserId: "628999999999@s.whatsapp.net",
            gamertag: "Viosca",
            itemName: "Dragon Pet",
            status: "SUCCESS" as const,
            message: "Gift delivered successfully"
        };

        const res = await app.request("/webhook/order-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean };
        expect(json.success).toBe(true);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.jid).toBe("628999999999@s.whatsapp.net");
        expect(sentMessages[0]?.text).toContain("BERHASIL DIKIRIM");
    });

    it("should notify customer when order has expired", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        const mockSender = {
            sendMessage: mock(async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            })
        };

        const app = createWebhookApp(mockSender, "628123456789");

        const res = await app.request("/webhook/order-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                orderId: "ord_exp",
                platform: "whatsapp",
                platformUserId: "628111111111@s.whatsapp.net",
                gamertag: "Notch",
                itemName: "Ultimate Rank",
                status: "EXPIRED",
                message: "Payment window expired"
            })
        });

        expect(res.status).toBe(200);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("KEDALUWARSA");
    });

    it("should delete buyer QR message and notify buyer when status is QUEUED", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        const deletedKeys: Array<{ jid: string; key: any }> = [];

        const mockSender = {
            sendMessage: mock(async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            })
        };

        const mockQrDeleter = mock(async (jid: string, key: any) => {
            deletedKeys.push({ jid, key });
        });

        const app = createWebhookApp({
            sender: mockSender,
            adminPhone: "628123456789",
            qrDeleter: mockQrDeleter
        });

        const res = await app.request("/webhook/order-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                orderId: "ord_paid",
                platform: "whatsapp",
                platformUserId: "628999@s.whatsapp.net",
                gamertag: "Steve",
                itemName: "Dragon Pet",
                status: "QUEUED",
                message: "Payment verified"
            })
        });

        expect(res.status).toBe(200);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("PEMBAYARAN DITERIMA");
        expect(mockQrDeleter).toHaveBeenCalled();
    });

    it("should notify admin in group with mention and send delay reassurance to buyer when status is INSUFFICIENT_TOKENS", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        let notifiedTokenOrder: any = null;

        const mockSender = {
            sendMessage: mock(async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            })
        };

        const mockAdminLogger = {
            updateOrderStatus: mock(async () => {}),
            notifyInsufficientTokens: mock(async (order: any) => {
                notifiedTokenOrder = order;
            })
        };

        const app = createWebhookApp({
            sender: mockSender,
            adminPhone: "628123456789",
            adminLogger: mockAdminLogger as any
        });

        const res = await app.request("/webhook/order-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                orderId: "ord_tok_low",
                platform: "whatsapp",
                platformUserId: "628999@s.whatsapp.net",
                gamertag: "Steve",
                itemName: "Ultimate Rank",
                status: "INSUFFICIENT_TOKENS",
                message: "Insufficient tokens! Available: 2, Required: 22."
            })
        });

        expect(res.status).toBe(200);
        expect(mockAdminLogger.notifyInsufficientTokens).toHaveBeenCalled();
        expect(notifiedTokenOrder?.orderId).toBe("ord_tok_low");
        expect(notifiedTokenOrder?.adminPhone).toBe("628123456789");

        // 1 message sent to buyer (delay reassurance)
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.jid).toBe("628999@s.whatsapp.net");
        expect(sentMessages[0]?.text).toContain("antre restock");
        expect(sentMessages[0]?.text).toContain("/bantuan");
    });

    it("should send buyer notification in English when getBuyerLanguage returns en", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];

        const mockSender = {
            sendMessage: mock(async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            })
        };

        const app = createWebhookApp({
            sender: mockSender,
            adminPhone: "628123456789",
            getBuyerLanguage: (_jid) => "en"
        });

        const res = await app.request("/webhook/order-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                orderId: "ord_en_success",
                platform: "whatsapp",
                platformUserId: "628999@s.whatsapp.net",
                gamertag: "Steve",
                itemName: "Dragon Pet",
                status: "SUCCESS"
            })
        });

        expect(res.status).toBe(200);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("ORDER DELIVERED SUCCESSFULLY");
        expect(sentMessages[0]?.text).toContain("Mailbox / Gift Box");
    });
});
