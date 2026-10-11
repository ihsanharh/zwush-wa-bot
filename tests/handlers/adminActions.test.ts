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
            sendText: async (_jid, text) => {
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
            sendText: async (_jid, text) => {
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
            sendText: async (_jid, text) => {
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
            sendText: async (jid, text) => {
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
            sendText: async (_jid, text) => {
                sentTexts.push(text);
            }
        } as any;

        await handleAdminAction("123@g.us", "btn_admin_paid_ORD-505", "6281@s.whatsapp.net", true, "id", ctx);
        expect(mockClient.markOrderAsPaid).toHaveBeenCalledWith("ORD-505");
        expect(mockClient.retryOrder).toHaveBeenCalledWith("ORD-505");

        await handleAdminAction("123@g.us", "btn_admin_done_ORD-606", "6281@s.whatsapp.net", true, "id", ctx);
        expect(mockClient.manualCompleteOrder).toHaveBeenCalledWith("ORD-606");
    });
});
