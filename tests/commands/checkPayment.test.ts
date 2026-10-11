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
            sendImage: async () => {},
        };
    });

    it("verifies payment when active pending order is verified", async () => {
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("PEMBAYARAN DIVERIFIKASI");
        expect(sentMessages[0]?.text).toContain("ORD-PENDING-1");
    });

    it("reports pending status when order not yet paid", async () => {
        state.setActiveOrderId(testJid, "ORD-NOT-PAID");
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("PEMBAYARAN BELUM TERDETEKSI");
    });

    it("shows cooldown when verification is on cooldown", async () => {
        state.setActiveOrderId(testJid, "ORD-COOLDOWN");
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.text).toContain("tunggu");
    });
});
