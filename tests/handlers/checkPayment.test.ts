import { describe, it, expect, beforeEach } from "bun:test";
import { handleIncomingMessage, type BotContext } from "../../src/handlers/message";
import { StateManager } from "../../src/state";

describe("Interactive Button: btn_check_payment", () => {
    let sentMessages: { jid: string; text: string }[];
    let mockClient: any;
    let state: StateManager;
    let mockContext: BotContext;
    const testJid = "628123456789@s.whatsapp.net";

    beforeEach(() => {
        sentMessages = [];
        state = new StateManager();
        state.setMaintenanceMode(false);
        state.setActiveOrderId(testJid, "ORD-PENDING-1");

        mockClient = {
            checkOrderPayment: async (orderId: string) => {
                if (orderId === "ORD-PENDING-1") {
                    return {
                        success: true,
                        verified: true,
                        order: {
                            id: "ORD-PENDING-1",
                            gamertag: "Steve",
                            itemName: "Hive+ Rank",
                            status: "QUEUED",
                            totalNominal: 25123,
                        },
                    };
                }
                if (orderId === "ORD-NOT-PAID") {
                    return {
                        success: true,
                        verified: false,
                        order: {
                            id: "ORD-NOT-PAID",
                            gamertag: "Alex",
                            itemName: "Costume",
                            status: "PENDING_PAYMENT",
                            totalNominal: 10000,
                        },
                    };
                }
                if (orderId === "ORD-COOLDOWN") {
                    return {
                        success: false,
                        code: "COOLDOWN",
                        remainingSeconds: 25,
                    };
                }
                return {
                    success: false,
                    code: "NOT_FOUND",
                    message: "Order not found",
                };
            },
        };

        mockContext = {
            state,
            client: mockClient,
            sendText: async (jid: string, text: string) => {
                sentMessages.push({ jid, text });
            },
            sendButtons: async (jid: string, payload: any) => {
                sentButtons.push({ jid, payload });
            },
            sendImage: async () => {},
        };
    });

    let sentButtons: { jid: string; payload: any }[] = [];

    beforeEach(() => {
        sentButtons = [];
    });

    it("verifies payment when active pending order is verified", async () => {
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("PEMBAYARAN DIVERIFIKASI");
        expect(sentMessages[0]?.text).toContain("ORD-PENDING-1");
    });

    it("reports pending status with looping quick-reply buttons when order not yet paid", async () => {
        state.setActiveOrderId(testJid, "ORD-NOT-PAID");
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("PEMBAYARAN BELUM MASUK");
        expect(sentButtons[0]?.payload.buttons.map((b: any) => b.id)).toEqual([
            "btn_check_payment"
        ]);
    });

    it("shows cooldown with looping quick-reply buttons when verification is on cooldown", async () => {
        state.setActiveOrderId(testJid, "ORD-COOLDOWN");
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("tunggu");
        expect(sentButtons[0]?.payload.buttons.map((b: any) => b.id)).toEqual([
            "btn_check_payment"
        ]);
    });

    it("shows expired notice with buy cosmetics quick-reply button when order is expired", async () => {
        mockClient.checkOrderPayment = async () => ({
            success: false,
            code: "ORDER_NOT_PAYABLE"
        });
        state.setActiveOrderId(testJid, "ORD-EXPIRED");
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("kedaluwarsa");
        expect(sentButtons[0]?.payload.buttons.map((b: any) => b.id)).toEqual([
            "btn_start_buying",
            "btn_history"
        ]);
    });

    it("falls back to sendText when sendButtons is not available", async () => {
        const textOnlyContext: BotContext = {
            ...mockContext,
            sendButtons: undefined
        };
        state.setActiveOrderId(testJid, "ORD-NOT-PAID");
        await handleIncomingMessage(testJid, false, "btn_check_payment", textOnlyContext);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("PEMBAYARAN BELUM MASUK");
    });

    it("should allow clicking btn_check_payment on follow-up message even when quoting follow-up stanzaId", async () => {
        state.setActiveOrderId(testJid, "ORD-NOT-PAID");
        state.setPromptMessageId(testJid, "invoice-msg-1");

        // 1. User clicks btn_check_payment on invoice
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext, undefined, undefined, "invoice-msg-1");
        expect(sentButtons.length).toBe(1);

        // 2. User clicks btn_check_payment on the follow-up message (quotes followup-msg-id)
        sentButtons = [];
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext, undefined, undefined, "followup-msg-id");
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("PEMBAYARAN BELUM MASUK");
    });
});
