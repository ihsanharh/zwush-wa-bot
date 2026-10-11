import { describe, expect, it, mock } from "bun:test";
import { AdminGroupLogger, type GroupMessageSender } from "../src/handlers/adminLogger";

describe("AdminGroupLogger", () => {
    it("should send log message on new order and store message key", async () => {
        const sentCalls: Array<{ jid: string; content: any; options?: any }> = [];
        const mockKey = { id: "msg_123", remoteJid: "group@g.us", fromMe: true };

        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (jid: string, content: any, options?: any) => {
                sentCalls.push({ jid, content, options });
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

        expect(sentCalls.length).toBe(2);
        // 1. First call: Main Order Log Message
        expect(sentCalls[0]?.jid).toBe("group@g.us");
        expect(sentCalls[0]?.content).toContain("ORDER BARU");
        expect(sentCalls[0]?.content).toContain("#ORD-123");
        expect(sentCalls[0]?.content).toContain("Dragon Pet");
        expect(sentCalls[0]?.content).toContain("Steve123");
        expect(sentCalls[0]?.content).toContain("25.012");
        expect(sentCalls[0]?.content).toContain("Menunggu Pembayaran");

        // 2. Second call: Follow-up message quoting the log message with Paid and Done action buttons
        expect(sentCalls[1]?.jid).toBe("group@g.us");
        expect(sentCalls[1]?.options?.quote).toEqual(mockKey);
        const buttons = sentCalls[1]?.content?.interactiveMessage?.nativeFlowMessage?.buttons;
        expect(buttons.length).toBe(2);
        expect(buttons[0]?.buttonParamsJson).toContain("btn_admin_paid_ORD-123");
        expect(buttons[1]?.buttonParamsJson).toContain("btn_admin_done_ORD-123");
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
            gamertag: "Steve123"
        });

        expect(mockSender.sendMessage).toHaveBeenCalled();
        expect(sentContent).toBeDefined();
        expect(sentContent.text).toContain("RESTOCK TOKEN DIBUTUHKAN");
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
        const fallbackSentMessages: string[] = [];
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (_jid: string, content: any) => {
                const text = typeof content === "string" ? content : (content?.text || "");
                fallbackSentMessages.push(text);
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
        expect(fallbackSentMessages.some(m => typeof m === "string" && m.includes("Selesai Dikirim (COMPLETED)"))).toBe(true);
        expect(fallbackSentMessages.some(m => typeof m === "string" && m.includes("#ORD-FALLBACK-1"))).toBe(true);
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

    it("should manage separate logGroupJid and adminGroupJid correctly", async () => {
        const sentJids: string[] = [];
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (jid: string) => {
                sentJids.push(jid);
                return { id: "msg_test" };
            }),
            editMessage: mock(async () => {})
        };

        const logger = new AdminGroupLogger(
            { logGroupJid: "logs@g.us", adminGroupJid: "admins@g.us" },
            mockSender
        );

        expect(logger.getLogGroupJid()).toBe("logs@g.us");
        expect(logger.getAdminGroupJid()).toBe("admins@g.us");

        // Order logs go to log group only (log card + quoted buttons)
        await logger.logNewOrder({
            orderId: "ORD-SPLIT-1",
            itemName: "Dragon Pet",
            gamertag: "Steve123",
            totalNominal: 25012,
            platformUserId: "628999@s.whatsapp.net"
        });
        expect(sentJids).toEqual(["logs@g.us", "logs@g.us"]);

        // Insufficient tokens alert broadcasts to both admin and log groups
        sentJids.length = 0;
        await logger.notifyInsufficientTokens({
            orderId: "ORD-SPLIT-1",
            itemName: "Dragon Pet",
            gamertag: "Steve123"
        });
        expect(sentJids).toContain("admins@g.us");
        expect(sentJids).toContain("logs@g.us");
    });

    it("should send quoted retry button when order fails or is held", async () => {
        const sentCalls: Array<{ jid: string; content: any; options?: any }> = [];
        const mockKey = { id: "msg_log_fail", remoteJid: "log@g.us", fromMe: true };
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (jid: string, content: any, options?: any) => {
                sentCalls.push({ jid, content, options });
                return { key: mockKey };
            }),
            editMessage: mock(async () => {})
        };

        const logger = new AdminGroupLogger("log@g.us", mockSender);
        await logger.logNewOrder({
            orderId: "ORD-FAIL-1",
            itemName: "XP Boost",
            gamertag: "Steve",
            totalNominal: 8000,
            platformUserId: "628111@s.whatsapp.net"
        });

        sentCalls.length = 0;
        await logger.updateOrderStatus("ORD-FAIL-1", "FAILED", { failureReason: "Gagal menghubungkan ke Hive" });

        expect(sentCalls.length).toBe(1);
        expect(sentCalls[0]?.options?.quote).toEqual(mockKey);
        const btn = sentCalls[0]?.content?.interactiveMessage?.nativeFlowMessage?.buttons[0];
        expect(btn?.buttonParamsJson).toContain("btn_admin_reprocess_ORD-FAIL-1");
    });

    it("should send support request with solved button", async () => {
        const sentCalls: Array<{ jid: string; content: any; options?: any }> = [];
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (jid: string, content: any, options?: any) => {
                sentCalls.push({ jid, content, options });
                return { id: "msg_support" };
            }),
            editMessage: mock(async () => {})
        };

        const logger = new AdminGroupLogger({ logGroupJid: "logs@g.us", adminGroupJid: "admins@g.us" }, mockSender);
        await logger.notifySupportRequest({
            orderId: "ORD-TICKET-1",
            platformUserId: "628999888777@s.whatsapp.net",
            reason: "User minta bantuan admin"
        });

        expect(sentCalls.length).toBe(2);
        // Call 1: Alert text with @everyone
        expect(sentCalls[0]?.content?.text || sentCalls[0]?.content).toContain("SUPPORT TICKET");
        // Call 2: Solved interactive button
        const btn = sentCalls[1]?.content?.interactiveMessage?.nativeFlowMessage?.buttons[0];
        expect(btn?.buttonParamsJson).toContain("btn_admin_solved_628999888777@s.whatsapp.net");
    });
});

