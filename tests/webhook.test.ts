import { describe, expect, it, mock } from "bun:test";
import { createWebhookApp } from "../src/handlers/webhook";
import { StateManager } from "../src/state";

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

    it("should notify admin group and send delay reassurance to buyer when status is INSUFFICIENT_TOKENS", async () => {
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

        // 1 message sent to buyer (delay reassurance)
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.jid).toBe("628999@s.whatsapp.net");
        expect(sentMessages[0]?.text).toContain("antre restock");
        expect(sentMessages[0]?.text).toContain("/support");
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

    it("should prompt buyer to re-enter gamertag when player not found (attempts <= 3)", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        const mockSender = {
            sendMessage: mock(async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            })
        };
        const state = new StateManager();
        const app = createWebhookApp({
            sender: mockSender,
            stateManager: state,
        });

        const res = await app.request("/webhook/order-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                orderId: "ord_retry_1",
                platform: "whatsapp",
                platformUserId: "628111@s.whatsapp.net",
                gamertag: "InvalidTag999",
                itemName: "Dragon Pet",
                status: "FAILED",
                message: "Sorry, we can't find a player named InvalidTag999"
            })
        });

        expect(res.status).toBe(200);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("GAMERTAG TIDAK DITEMUKAN");
        expect(sentMessages[0]?.text).toContain("Percobaan 1 dari 3");
        expect(state.getSession("628111@s.whatsapp.net").step).toBe("AWAITING_RETRY_GAMERTAG");
    });

    it("should prompt buyer to contact admin via /support when 3 attempts fail", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        const mockSender = {
            sendMessage: mock(async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            })
        };
        const state = new StateManager();
        state.incrementOrderRetryAttempts("ord_retry_max");
        state.incrementOrderRetryAttempts("ord_retry_max");

        const app = createWebhookApp({
            sender: mockSender,
            stateManager: state,
        });

        const res = await app.request("/webhook/order-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                orderId: "ord_retry_max",
                platform: "whatsapp",
                platformUserId: "628111@s.whatsapp.net",
                gamertag: "InvalidTag999",
                itemName: "Dragon Pet",
                status: "FAILED",
                message: "Sorry, we can't find a player named InvalidTag999"
            })
        });

        expect(res.status).toBe(200);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("SUDAH 3 KALI PERCOBAAN");
        expect(sentMessages[0]?.text).toContain("/support");
        expect(state.getSession("628111@s.whatsapp.net").step).toBe("IDLE");
    });

    it("should ignore stale notifications with timestamp older than 5 minutes (300s)", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        const mockSender = {
            sendMessage: mock(async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            })
        };

        const app = createWebhookApp(mockSender);

        // Stale timestamp (10 minutes ago)
        const staleTimestamp = Date.now() - 600000;
        const res = await app.request("/webhook/order-update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                orderId: "ord_stale_123",
                platform: "whatsapp",
                platformUserId: "628111111111@s.whatsapp.net",
                gamertag: "Notch",
                itemName: "Ultimate Rank",
                status: "EXPIRED",
                message: "Payment window expired",
                timestamp: staleTimestamp
            })
        });

        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; ignored?: boolean };
        expect(json.success).toBe(true);
        expect(json.ignored).toBe(true);
        // Sender should NOT have sent any message to customer
        expect(sentMessages.length).toBe(0);
    });
});
