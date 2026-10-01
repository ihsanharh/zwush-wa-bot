import { describe, it, expect, beforeEach } from "bun:test";
import { checkPaymentCommand } from "../../src/commands/general/checkPayment";
import type { CommandContext } from "../../src/commands/types";

describe("General Command: /cek (Check Payment)", () => {
    let sentMessages: { jid: string; text: string }[];
    let mockClient: any;
    let mockContext: CommandContext;

    beforeEach(() => {
        sentMessages = [];
        mockClient = {
            getUserOrders: async () => [
                {
                    id: "ORD-PENDING-1",
                    gamertag: "Steve",
                    itemName: "Hive+ Rank",
                    status: "PENDING_PAYMENT",
                    totalNominal: 25123,
                },
            ],
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
            remoteJid: "62812345678@s.whatsapp.net",
            sender: "62812345678@s.whatsapp.net",
            isGroup: false,
            args: [],
            userLang: "id",
            ctx: {
                client: mockClient,
                sendText: async (jid: string, text: string) => {
                    sentMessages.push({ jid, text });
                    return {} as any;
                },
            } as any,
        };
    });

    it("should auto-detect pending order and verify payment successfully", async () => {
        await checkPaymentCommand.execute(mockContext);

        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].text).toContain("PEMBAYARAN DIVERIFIKASI");
        expect(sentMessages[0].text).toContain("ORD-PENDING-1");
        expect(sentMessages[0].text).toContain("25.123");
    });

    it("should send pending message when transaction not found in GoBiz yet", async () => {
        mockClient.getUserOrders = async () => [
            {
                id: "ORD-NOT-PAID",
                gamertag: "Alex",
                itemName: "Costume",
                status: "PENDING_PAYMENT",
                totalNominal: 10000,
            },
        ];

        await checkPaymentCommand.execute(mockContext);

        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].text).toContain("PEMBAYARAN BELUM TERDETEKSI");
        expect(sentMessages[0].text).toContain("ORD-NOT-PAID");
    });

    it("should warn user about cooldown if checked too quickly", async () => {
        mockContext.args = ["ORD-COOLDOWN"];
        await checkPaymentCommand.execute(mockContext);

        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].text).toContain("25 detik");
    });

    it("should notice user if no active pending order exists", async () => {
        mockClient.getUserOrders = async () => [];
        await checkPaymentCommand.execute(mockContext);

        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].text).toContain("tidak memiliki pesanan aktif");
    });
});
