import { describe, it, expect, beforeEach, mock } from "bun:test";
import { handleIncomingMessage } from "../../src/handlers/message";
import { AdminGroupLogger } from "../../src/handlers/adminLogger";
import { StateManager } from "../../src/state";
import type { BotContext } from "../../src/handlers/message";

describe("Admin Interactive Buttons & Action Handlers", () => {
    let state: StateManager;
    let sentTexts: { jid: string; text: string }[];
    let mockContext: BotContext;
    const adminGroupJid = "12036304@g.us";
    const adminUser = "628999999999@s.whatsapp.net";
    const nonAdminUser = "628111111111@s.whatsapp.net";

    beforeEach(() => {
        state = new StateManager();
        sentTexts = [];

        const adminLogger = new AdminGroupLogger(
            { adminGroupJid, logGroupJid: adminGroupJid },
            {
                sendMessage: async () => ({ id: "msg-1" }),
                editMessage: async () => ({})
            }
        );

        mockContext = {
            state,
            adminLogger,
            client: {
                reprocessOrder: mock(async (id: string) => ({ success: true, orderId: id })),
                updateOrderStatus: mock(async (id: string, status: string) => ({ success: true, orderId: id, status })),
                markOrderPaid: mock(async (id: string) => ({ success: true, orderId: id })),
                cancelOrder: mock(async (id: string) => ({ orderId: id, status: "CANCELLED" })),
                getOrders: async () => [],
                getUnfinishedOrders: async () => []
            } as any,
            sendText: async (jid: string, text: string) => {
                sentTexts.push({ jid, text });
            },
            sendImage: async () => ({})
        };
    });

    it("should reprocess order when admin clicks btn_admin_reprocess_ORD-12345 in group", async () => {
        await handleIncomingMessage(
            adminGroupJid,
            false,
            "btn_admin_reprocess_ORD-12345",
            mockContext,
            adminUser
        );
        expect(mockContext.client.reprocessOrder).toHaveBeenCalledWith("ORD-12345");
    });

    it("should complete order when admin clicks btn_admin_done_ORD-999 in group", async () => {
        await handleIncomingMessage(
            adminGroupJid,
            false,
            "btn_admin_done_ORD-999",
            mockContext,
            adminUser
        );
        expect(mockContext.client.updateOrderStatus).toHaveBeenCalledWith("ORD-999", "COMPLETED");
    });

    it("should cancel order when admin clicks btn_admin_cancel_ORD-777 in group", async () => {
        await handleIncomingMessage(
            adminGroupJid,
            false,
            "btn_admin_cancel_ORD-777",
            mockContext,
            adminUser
        );
        expect(mockContext.client.cancelOrder).toHaveBeenCalled();
    });

    it("should ignore admin action clicks from non-authorized groups", async () => {
        await handleIncomingMessage(
            "1203999999@g.us",
            false,
            "btn_admin_reprocess_ORD-12345",
            mockContext,
            nonAdminUser
        );
        expect(mockContext.client.reprocessOrder).not.toHaveBeenCalled();
    });

    it("notifySupportRequest should send interactive solved button", async () => {
        let sentMessagePayload: any = null;
        const logger = new AdminGroupLogger(
            { adminGroupJid: "12036304@g.us" },
            {
                sendMessage: async (_jid, content) => {
                    sentMessagePayload = content;
                    return { id: "msg-btn" };
                },
                editMessage: async () => ({})
            }
        );

        await logger.notifySupportRequest({
            orderId: "ORD-FAIL1",
            platformUserId: "628123456@s.whatsapp.net",
            reason: "Gamertag failed"
        });

        expect(sentMessagePayload).toBeDefined();
        expect(sentMessagePayload.interactiveMessage).toBeDefined();
        const buttons = sentMessagePayload.interactiveMessage.nativeFlowMessage.buttons;
        expect(buttons.length).toBe(1);
        const b0 = JSON.parse(buttons[0].buttonParamsJson);
        expect(b0.id).toBe("btn_admin_solved_628123456@s.whatsapp.net");
    });
});
