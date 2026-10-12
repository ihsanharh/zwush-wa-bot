import { describe, expect, it, mock } from "bun:test";
import { handleAdminAction } from "../../src/handlers/adminActions";
import type { BotContext } from "../../src/handlers/message";
import { StateManager } from "../../src/state";

describe("Admin Action Handlers", () => {
    it("should handle btn_admin_paid by marking paid and reprocessing", async () => {
        const sentTexts: string[] = [];
        const state = new StateManager();
        const mockClient = {
            markOrderPaid: mock(async () => ({ success: true })),
            reprocessOrder: mock(async () => ({ success: true }))
        } as any;

        const ctx: BotContext = {
            client: mockClient,
            state,
            sendText: async (_jid: string, text: string) => {
                sentTexts.push(text);
            }
        } as any;

        const handled = await handleAdminAction(
            "123@g.us",
            "btn_admin_paid_ORD-101",
            "628123456789@s.whatsapp.net",
            true,
            "id",
            ctx
        );

        expect(handled).toBe(true);
        expect(mockClient.markOrderPaid).toHaveBeenCalledWith("ORD-101");
        expect(mockClient.reprocessOrder).toHaveBeenCalledWith("ORD-101");
        expect(sentTexts[0]).toContain("LUNAS");
    });

    it("should handle btn_admin_done by updating status to COMPLETED", async () => {
        const sentTexts: string[] = [];
        const state = new StateManager();
        const mockClient = {
            updateOrderStatus: mock(async () => ({ success: true }))
        } as any;

        const ctx: BotContext = {
            client: mockClient,
            state,
            sendText: async (_jid: string, text: string) => {
                sentTexts.push(text);
            }
        } as any;

        const handled = await handleAdminAction(
            "123@g.us",
            "btn_admin_done_ORD-202",
            "628123456789@s.whatsapp.net",
            true,
            "id",
            ctx
        );

        expect(handled).toBe(true);
        expect(mockClient.updateOrderStatus).toHaveBeenCalledWith("ORD-202", "COMPLETED");
        expect(sentTexts[0]).toContain("diselesaikan");
    });

    it("should handle btn_admin_reprocess by reprocessing order", async () => {
        const sentTexts: string[] = [];
        const state = new StateManager();
        const mockClient = {
            reprocessOrder: mock(async () => ({ success: true }))
        } as any;

        const ctx: BotContext = {
            client: mockClient,
            state,
            sendText: async (_jid: string, text: string) => {
                sentTexts.push(text);
            }
        } as any;

        const handled = await handleAdminAction(
            "123@g.us",
            "btn_admin_reprocess_ORD-303",
            "628123456789@s.whatsapp.net",
            true,
            "id",
            ctx
        );

        expect(handled).toBe(true);
        expect(mockClient.reprocessOrder).toHaveBeenCalledWith("ORD-303");
        expect(sentTexts[0]).toContain("dikirim ulang");
    });

    it("should handle btn_admin_solved by resolving live chat and resetting session", async () => {
        const sentTexts: Array<{ jid: string; text: string }> = [];
        const state = new StateManager();
        const userJid = "628999888777@s.whatsapp.net";
        state.startLiveChat(userJid);

        const ctx: BotContext = {
            client: {} as any,
            state,
            sendText: async (jid: string, text: string) => {
                sentTexts.push({ jid, text });
            }
        } as any;

        const handled = await handleAdminAction(
            "admin-group@g.us",
            `btn_admin_solved_${userJid}`,
            "admin@s.whatsapp.net",
            true,
            "id",
            ctx
        );

        expect(handled).toBe(true);
        expect(state.getSession(userJid).step).toBe("IDLE");
        // Sends buyer closing text
        expect(sentTexts.some((m) => m.jid === userJid)).toBe(true);
        // Sends admin confirmation
        expect(sentTexts.some((m) => m.jid === "admin-group@g.us")).toBe(true);
    });

    it("should handle standard CoreClient methods (markOrderAsPaid, manualCompleteOrder, retryOrder)", async () => {
        const sentTexts: string[] = [];
        const state = new StateManager();
        const mockClient = {
            markOrderAsPaid: mock(async () => ({ success: true })),
            manualCompleteOrder: mock(async () => ({ success: true })),
            retryOrder: mock(async () => ({ success: true }))
        } as any;

        const ctx: BotContext = {
            client: mockClient,
            state,
            sendText: async (_jid: string, text: string) => {
                sentTexts.push(text);
            }
        } as any;

        await handleAdminAction("123@g.us", "btn_admin_paid_ORD-505", "6281@s.whatsapp.net", true, "id", ctx);
        expect(mockClient.markOrderAsPaid).toHaveBeenCalledWith("ORD-505");
        expect(mockClient.retryOrder).toHaveBeenCalledWith("ORD-505");

        await handleAdminAction("123@g.us", "btn_admin_done_ORD-606", "6281@s.whatsapp.net", true, "id", ctx);
        expect(mockClient.manualCompleteOrder).toHaveBeenCalledWith("ORD-606");
    });

    it("should notify buyer when order is marked as paid and queued", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        const state = new StateManager();
        const buyerJid = "628999111222@s.whatsapp.net";
        const mockClient = {
            markOrderAsPaid: mock(async () => ({ success: true })),
            retryOrder: mock(async () => ({ success: true })),
            getOrderStatus: mock(async () => ({
                orderId: "ORD-707",
                platformUserId: buyerJid,
                itemName: "Dragon Pet",
                gamertag: "Viosca"
            }))
        } as any;

        const ctx: BotContext = {
            client: mockClient,
            state,
            sendText: async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            }
        } as any;

        await handleAdminAction("admin@g.us", "btn_admin_paid_ORD-707", "628admin@s.whatsapp.net", true, "id", ctx);

        // Expect notification sent to buyer
        const buyerMsg = sentMessages.find((m) => m.jid === buyerJid);
        expect(buyerMsg).toBeDefined();
        expect(buyerMsg?.text).toContain("PEMBAYARAN DITERIMA & DIVERIFIKASI");
        expect(buyerMsg?.text).toContain("antrean pengiriman The Hive");
    });

    it("should notify buyer when order is marked as completed manually by admin", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        const state = new StateManager();
        const buyerJid = "628999333444@s.whatsapp.net";
        const mockClient = {
            manualCompleteOrder: mock(async () => ({ success: true })),
            getOrderStatus: mock(async () => ({
                orderId: "ORD-808",
                platformUserId: buyerJid,
                itemName: "Ultimate Rank",
                gamertag: "Steve"
            }))
        } as any;

        const ctx: BotContext = {
            client: mockClient,
            state,
            sendText: async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            }
        } as any;

        await handleAdminAction("admin@g.us", "btn_admin_done_ORD-808", "628admin@s.whatsapp.net", true, "id", ctx);

        const buyerMsg = sentMessages.find((m) => m.jid === buyerJid);
        expect(buyerMsg).toBeDefined();
        expect(buyerMsg?.text).toContain("PESANAN SELESAI");
        expect(buyerMsg?.text).toContain("diselesaikan oleh Admin");
    });

    it("should send retry button to admin group and live chat button to buyer when reprocess/retry fails", async () => {
        const sentMessages: Array<{ jid: string; text: string }> = [];
        const sentButtonsList: Array<{ jid: string; payload: any }> = [];
        const state = new StateManager();
        const buyerJid = "628999555666@s.whatsapp.net";

        const mockClient = {
            retryOrder: mock(async () => {
                throw new Error("The Hive server timeout / fatal connection");
            }),
            getOrderStatus: mock(async () => ({
                orderId: "ORD-909",
                platformUserId: buyerJid,
                itemName: "Cape",
                gamertag: "Alex"
            }))
        } as any;

        const ctx: BotContext = {
            client: mockClient,
            state,
            sendText: async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            },
            sendButtons: async (jid: string, payload: any) => {
                sentButtonsList.push({ jid, payload });
            }
        } as any;

        await handleAdminAction("admin@g.us", "btn_admin_reprocess_ORD-909", "628admin@s.whatsapp.net", true, "id", ctx);

        // Group should receive retry button
        const groupBtns = sentButtonsList.find((b) => b.jid === "admin@g.us");
        expect(groupBtns).toBeDefined();
        const retryParam = JSON.parse(groupBtns?.payload.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        expect(retryParam.id).toBe("btn_admin_reprocess_ORD-909");
        expect(retryParam.display_text).toBe("Retry");

        // Buyer should receive live chat button
        const buyerBtns = sentButtonsList.find((b) => b.jid === buyerJid);
        expect(buyerBtns).toBeDefined();
        const chatParam = JSON.parse(buyerBtns?.payload.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        expect(chatParam.id).toBe("btn_start_livechat_ORD-909");
        expect(chatParam.display_text).toContain("Mulai Live Chat");
    });
});
