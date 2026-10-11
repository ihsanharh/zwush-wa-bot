import { describe, it, expect, beforeEach, mock } from "bun:test";
import { handleIncomingMessage } from "../../src/handlers/message";
import { AdminGroupLogger } from "../../src/handlers/adminLogger";
import { StateManager } from "../../src/state";
import type { BotContext } from "../../src/handlers/message";
import { defaultRegistry } from "../../src/commands";

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
                reprocessHeldOrder: async (id: string) => ({ orderId: id, status: "QUEUED" }),
                manualCompleteOrder: async (id: string) => ({ orderId: id, status: "SUCCESS" }),
                cancelOrder: async (id: string) => ({ orderId: id, status: "CANCELLED" }),
                getOrders: async () => [],
                getUnfinishedOrders: async () => []
            } as any,
            sendText: async (jid: string, text: string) => {
                sentTexts.push({ jid, text });
            },
            sendImage: async () => ({})
        };
    });

    it("should reprocess order when admin clicks admin_reprocess_ORD-12345 in group", async () => {
        const reprocessCmd = defaultRegistry.get("/reprocess")!;
        const originalExecute = reprocessCmd.execute;
        let executedOrderId = "";
        reprocessCmd.execute = mock(async ({ args }) => {
            executedOrderId = args[0] || "";
        });

        try {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "admin_reprocess_ORD-12345",
                mockContext,
                adminUser
            );
            expect(executedOrderId).toBe("ORD-12345");
        } finally {
            reprocessCmd.execute = originalExecute;
        }
    });

    it("should complete order when admin clicks admin_done_ORD-999 in group", async () => {
        const doneCmd = defaultRegistry.get("/done")!;
        const originalExecute = doneCmd.execute;
        let executedOrderId = "";
        doneCmd.execute = mock(async ({ args }) => {
            executedOrderId = args[0] || "";
        });

        try {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "admin_done_ORD-999",
                mockContext,
                adminUser
            );
            expect(executedOrderId).toBe("ORD-999");
        } finally {
            doneCmd.execute = originalExecute;
        }
    });

    it("should cancel order when admin clicks admin_cancel_ORD-777 in group", async () => {
        const cancelCmd = defaultRegistry.get("/batal")!;
        const originalExecute = cancelCmd.execute;
        let executedOrderId = "";
        cancelCmd.execute = mock(async ({ args }) => {
            executedOrderId = args[0] || "";
        });

        try {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "admin_cancel_ORD-777",
                mockContext,
                adminUser
            );
            expect(executedOrderId).toBe("ORD-777");
        } finally {
            cancelCmd.execute = originalExecute;
        }
    });

    it("should ignore admin action clicks from non-admins in group", async () => {
        const reprocessCmd = defaultRegistry.get("/reprocess")!;
        const originalExecute = reprocessCmd.execute;
        let called = false;
        reprocessCmd.execute = mock(async () => {
            called = true;
        });

        try {
            await handleIncomingMessage(
                "1203999999@g.us",
                false,
                "admin_reprocess_ORD-12345",
                mockContext,
                nonAdminUser
            );
            expect(called).toBe(false);
        } finally {
            reprocessCmd.execute = originalExecute;
        }
    });

    it("notifySupportRequest should send action buttons if orderId is provided", async () => {
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
        expect(buttons.length).toBe(3);
        const b0 = JSON.parse(buttons[0].buttonParamsJson);
        expect(b0.id).toBe("btn_admin_reprocess_ORD-FAIL1");
    });
});
