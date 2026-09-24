import { describe, expect, it, mock } from "bun:test";
import { AdminGroupLogger, type GroupMessageSender } from "../src/handlers/adminLogger";

describe("AdminGroupLogger", () => {
    it("should send log message on new order and store message key", async () => {
        let sentJid = "";
        let sentText = "";
        const mockKey = { id: "msg_123", remoteJid: "group@g.us", fromMe: true };

        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (jid: string, text: string) => {
                sentJid = jid;
                sentText = text;
                return { key: mockKey };
            }),
            editMessage: mock(async () => {})
        };

        const logger = new AdminGroupLogger("group@g.us", mockSender);

        await logger.logNewOrder({
            orderId: "ORD-123",
            itemName: "Dragon Pet",
            gamertag: "Steve123",
            totalNominal: 25012,
            platformUserId: "628999@s.whatsapp.net"
        });

        expect(sentJid).toBe("group@g.us");
        expect(sentText).toContain("ORDER BARU");
        expect(sentText).toContain("#ORD-123");
        expect(sentText).toContain("Dragon Pet");
        expect(sentText).toContain("Steve123");
        expect(sentText).toContain("25.012");
        expect(sentText).toContain("Menunggu Pembayaran");
    });

    it("should edit group message when order status changes", async () => {
        let editedJid = "";
        let editedKey: any = null;
        let editedText = "";
        const mockKey = { id: "msg_123", remoteJid: "group@g.us", fromMe: true };

        const mockSender: GroupMessageSender = {
            sendMessage: mock(async () => ({ key: mockKey })),
            editMessage: mock(async (jid: string, key: any, newText: string) => {
                editedJid = jid;
                editedKey = key;
                editedText = newText;
            })
        };

        const logger = new AdminGroupLogger("group@g.us", mockSender);

        await logger.logNewOrder({
            orderId: "ORD-123",
            itemName: "Dragon Pet",
            gamertag: "Steve123",
            totalNominal: 25012,
            platformUserId: "628999@s.whatsapp.net"
        });

        await logger.updateOrderStatus("ORD-123", "QUEUED");

        expect(editedJid).toBe("group@g.us");
        expect(editedKey).toEqual(mockKey);
        expect(editedText).toContain("Pembayaran Diterima / Dalam Antrean");

        await logger.updateOrderStatus("ORD-123", "INSUFFICIENT_TOKENS");
        expect(editedText).toContain("Token Kurang / Menunggu Restock");

        await logger.updateOrderStatus("ORD-123", "SUCCESS");
        expect(editedText).toContain("Selesai Dikirim (COMPLETED)");
    });

    it("should gracefully do nothing if no admin group configured or order not tracked", async () => {
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async () => ({})),
            editMessage: mock(async () => {})
        };

        const logger = new AdminGroupLogger("", mockSender);
        await logger.logNewOrder({
            orderId: "ORD-999",
            itemName: "Hat",
            gamertag: "Gamer",
            totalNominal: 15000,
            platformUserId: "user"
        });
        expect(mockSender.sendMessage).not.toHaveBeenCalled();

        await logger.updateOrderStatus("ORD-UNKNOWN", "SUCCESS");
        expect(mockSender.editMessage).not.toHaveBeenCalled();
    });

    it("should send admin mention alert to group when notifyInsufficientTokens is called", async () => {
        let sentContent: any = null;
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (_jid: string, content: any) => {
                sentContent = content;
                return {};
            }),
            editMessage: mock(async () => {})
        };

        const logger = new AdminGroupLogger("120363@g.us", mockSender);
        await logger.notifyInsufficientTokens({
            orderId: "ORD-INSUFF-99",
            itemName: "Dragon Pet",
            gamertag: "Steve123",
            adminPhone: "628123456789"
        });

        expect(mockSender.sendMessage).toHaveBeenCalled();
        expect(sentContent).toBeDefined();
        expect(sentContent.text).toContain("@628123456789");
        expect(sentContent.text).toContain("RESTOCK TOKEN DIBUTUHKAN");
        expect(sentContent.contextInfo?.mentionedJid).toContain("628123456789@s.whatsapp.net");
    });

    it("should handle zapo-js publish result with id instead of key and edit message on status update", async () => {
        let editedKey: any = null;
        let editedText = "";
        const mockSender: GroupMessageSender = {
            // zapo-js returns { id: "3EB0..." }
            sendMessage: mock(async () => ({ id: "zapo_msg_999", attempts: 1 })),
            editMessage: mock(async (_jid: string, key: any, newText: string) => {
                editedKey = key;
                editedText = newText;
            })
        };

        const logger = new AdminGroupLogger("group@g.us", mockSender);
        await logger.logNewOrder({
            orderId: "ORD-ZAPO-1",
            itemName: "Dragon Pet",
            gamertag: "Steve123",
            totalNominal: 25012,
            platformUserId: "628999@s.whatsapp.net"
        });

        await logger.updateOrderStatus("ORD-ZAPO-1", "QUEUED");
        expect(editedKey).toEqual({ id: "zapo_msg_999", remoteJid: "group@g.us", fromMe: true });
        expect(editedText).toContain("Pembayaran Diterima / Dalam Antrean");
    });

    it("should fallback to sending new message if editMessage throws", async () => {
        let fallbackSentText = "";
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (_jid: string, content: any) => {
                fallbackSentText = typeof content === "string" ? content : content.text;
                return { id: "msg_init" };
            }),
            editMessage: mock(async () => {
                throw new Error("WhatsApp edit window expired");
            })
        };

        const logger = new AdminGroupLogger("group@g.us", mockSender);
        await logger.logNewOrder({
            orderId: "ORD-FALLBACK-1",
            itemName: "Dragon Pet",
            gamertag: "Steve123",
            totalNominal: 25012,
            platformUserId: "628999@s.whatsapp.net"
        });

        await logger.updateOrderStatus("ORD-FALLBACK-1", "SUCCESS");
        expect(fallbackSentText).toContain("Selesai Dikirim (COMPLETED)");
        expect(fallbackSentText).toContain("#ORD-FALLBACK-1");
    });

    it("should send status update to group if order was not in memory (e.g. after bot restart)", async () => {
        let sentMessage = "";
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (_jid: string, content: any) => {
                sentMessage = typeof content === "string" ? content : content.text;
                return { id: "msg_restarted" };
            }),
            editMessage: mock(async () => {})
        };

        const logger = new AdminGroupLogger("group@g.us", mockSender);
        // Order was never logged in this session
        await logger.updateOrderStatus("ORD-RESTARTED-1", "SUCCESS", {
            itemName: "Dragon Pet",
            gamertag: "Steve123",
            platformUserId: "628999@s.whatsapp.net"
        });

        expect(mockSender.sendMessage).toHaveBeenCalled();
        expect(sentMessage).toContain("#ORD-RESTARTED-1");
        expect(sentMessage).toContain("Dragon Pet");
        expect(sentMessage).toContain("Steve123");
        expect(sentMessage).toContain("Selesai Dikirim (COMPLETED)");
    });
});

