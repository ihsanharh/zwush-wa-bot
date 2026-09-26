import { describe, expect, it, mock } from "bun:test";
import {
    handleIncomingMessage,
    type BotContext
} from "../src/handlers/message";
import { StateManager } from "../src/state";
import type { CatalogItem, VoucherStatusResponse, VoucherValidationResponse } from "../src/types";

describe("Voucher & Store Discount Message Handlers", () => {
    const dummyItems: CatalogItem[] = [
        {
            id: "1",
            name: "Dragon Pet",
            category: "Regular Pet",
            tokenCost: 10,
            minecoins: 660,
            originalPrice: 50000,
            rupiahPrice: 25000,
            discountPercent: 50,
            imageUrl: "https://cdn.playhive.com/avatars/pet-dragon.png",
            active: true
        }
    ];

    function createMockContext() {
        const sentTexts: Array<{ jid: string; text: string; mentions?: string[] }> = [];
        const sentImages: Array<{ jid: string; buffer: Buffer; caption: string }> = [];

        const mockClient = {
            getCatalog: mock(async () => dummyItems),
            createOrder: mock(async (_gamertag: string, _itemName: string, _platformUserId: string, _voucherCode?: string) => ({
                success: true,
                orderId: "ord_vouch_1",
                totalNominal: 20012,
                qrisString: "00020101021226570014ID.CO.QRIS.WWW5802ID5909ZwushStore6304ABCD",
                expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
            })),
            getOrderStatus: mock(async (id: string) => ({
                id,
                gamertag: "Steve123",
                itemName: "Dragon Pet",
                status: "QUEUED" as const,
                totalNominal: 20012
            })),
            getOrderQrPng: mock(async (_id: string) => Buffer.from([0x89, 0x50, 0x4e, 0x47])),
            getUserOrders: mock(async () => []),
            getVoucherStatus: mock(async (): Promise<VoucherStatusResponse> => ({
                success: true,
                discountPercent: 50,
                vouchers: [
                    {
                        id: "v1",
                        code: "HEMAT5K",
                        discountType: "FLAT",
                        discountValue: 5000,
                        maxUses: 100,
                        usedCount: 5,
                        active: true,
                        createdAt: "2026-09-25T00:00:00.000Z"
                    }
                ]
            })),
            setStoreDiscount: mock(async (_percent: number) => ({
                success: true,
                discountPercent: _percent
            })),
            createVoucher: mock(async (payload: any) => ({
                id: "v2",
                code: payload.code,
                discountType: payload.discountType,
                discountValue: payload.discountValue,
                maxUses: payload.maxUses ?? null,
                usedCount: 0,
                active: true,
                createdAt: "2026-09-25T00:00:00.000Z"
            })),
            deleteVoucher: mock(async (_code: string) => ({
                success: true,
                message: "Voucher deleted"
            })),
            validateVoucher: mock(async (code: string, _itemName: string): Promise<VoucherValidationResponse> => {
                if (code === "HEMAT5K") {
                    return {
                        success: true,
                        valid: true,
                        code: "HEMAT5K",
                        discountType: "FLAT",
                        discountValue: 5000,
                        discountNominal: 5000,
                        originalPrice: 50000,
                        storePrice: 25000,
                        finalPrice: 20000
                    };
                }
                if (code === "EXHAUSTED") {
                    throw new Error("VOUCHER_EXHAUSTED: Kuota voucher sudah habis");
                }
                throw new Error("VOUCHER_NOT_FOUND: Voucher tidak valid");
            })
        };

        const state = new StateManager();
        const adminGroupJid = "120363admin@g.us";
        const mockAdminLogger = {
            adminGroupJid,
            getAdminGroupJid: () => adminGroupJid
        };

        const ctx: BotContext = {
            client: mockClient as any,
            state,
            adminLogger: mockAdminLogger as any,
            sendText: mock(async (jid: string, text: string, mentions?: string[]) => {
                sentTexts.push({ jid, text, mentions });
            }),
            sendImage: mock(async (jid: string, buffer: Buffer, caption: string) => {
                sentImages.push({ jid, buffer, caption });
                return { key: { id: "msg_img_1" } };
            })
        };

        return { ctx, mockClient, state, sentTexts, sentImages, adminGroupJid };
    }

    describe("Admin /setdiskon & /setdiscount commands", () => {
        it("allows admin to set store discount via /setdiskon", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/setdiskon 40", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.setStoreDiscount).toHaveBeenCalledWith(40);
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("40%");
        });

        it("allows admin to set store discount via /setdiscount (English alias)", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/setdiscount 20", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.setStoreDiscount).toHaveBeenCalledWith(20);
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("20%");
        });

        it("validates percentage range (0-90)", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/setdiskon 95", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.setStoreDiscount).not.toHaveBeenCalled();
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("antara 0 hingga 90");
        });

        it("allows admin to set store discount with percent sign (e.g. 60% or 60 %)", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/setdiskon 60%", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.setStoreDiscount).toHaveBeenCalledWith(60);
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("60%");

            await handleIncomingMessage(adminGroupJid, false, "/setdiskon 70 %", ctx, "admin_user@s.whatsapp.net");
            expect(mockClient.setStoreDiscount).toHaveBeenCalledWith(70);
            expect(sentTexts[1].text).toContain("70%");
        });

        it("is crash-proof against invalid non-numeric inputs for /setdiskon", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/setdiskon abc", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.setStoreDiscount).not.toHaveBeenCalled();
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("antara 0 hingga 90");
        });

        it("is crash-proof against backend errors when setting discount", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();
            mockClient.setStoreDiscount = mock(async () => {
                throw new Error("Connection refused");
            });

            await handleIncomingMessage(adminGroupJid, false, "/setdiskon 60%", ctx, "admin_user@s.whatsapp.net");

            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("Gagal mengubah diskon");
        });

        it("shows usage if /setdiskon has no arguments", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/setdiskon", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.setStoreDiscount).not.toHaveBeenCalled();
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("Penggunaan");
        });

        it("rejects non-admin in DM with unrecognized command response", async () => {
            const { ctx, mockClient, sentTexts } = createMockContext();
            const nonAdminJid = "628999999999@s.whatsapp.net";

            await handleIncomingMessage(nonAdminJid, false, "/setdiskon 40", ctx);

            expect(mockClient.setStoreDiscount).not.toHaveBeenCalled();
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("tidak dikenali");
        });

        it("responds with unknown command for non-admin in group chat", async () => {
            const { ctx, mockClient, sentTexts } = createMockContext();
            const groupJid = "120363000000000000@g.us";
            const nonAdminParticipant = "628999999999@s.whatsapp.net";

            await handleIncomingMessage(groupJid, false, "/setdiskon 40", ctx, nonAdminParticipant);

            expect(mockClient.setStoreDiscount).not.toHaveBeenCalled();
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("tidak dikenali");
        });
    });

    describe("Admin /voucher commands", () => {
        it("allows admin to view voucher status via /voucher or /voucher list", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/voucher", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.getVoucherStatus).toHaveBeenCalled();
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("HEMAT5K");
            expect(sentTexts[0].text).toContain("50%");
        });

        it("allows admin to create percentage voucher via /voucher create", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/voucher create MERDEKA 10% 50", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.createVoucher).toHaveBeenCalledWith({
                code: "MERDEKA",
                discountType: "PERCENT",
                discountValue: 10,
                maxUses: 50
            });
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("MERDEKA");
        });

        it("allows admin to create flat IDR voucher via /voucher buat (Indonesian alias)", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/voucher buat POTONGAN 5000", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.createVoucher).toHaveBeenCalledWith({
                code: "POTONGAN",
                discountType: "FLAT",
                discountValue: 5000,
                maxUses: undefined
            });
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("POTONGAN");
        });

        it("allows admin to delete voucher via /voucher delete", async () => {
            const { ctx, mockClient, sentTexts, adminGroupJid } = createMockContext();

            await handleIncomingMessage(adminGroupJid, false, "/voucher delete HEMAT5K", ctx, "admin_user@s.whatsapp.net");

            expect(mockClient.deleteVoucher).toHaveBeenCalledWith("HEMAT5K");
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("HEMAT5K");
        });

        it("rejects non-admin /voucher in DM with unrecognized command", async () => {
            const { ctx, mockClient, sentTexts } = createMockContext();
            const nonAdminJid = "628999999999@s.whatsapp.net";

            await handleIncomingMessage(nonAdminJid, false, "/voucher", ctx);

            expect(mockClient.getVoucherStatus).not.toHaveBeenCalled();
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("tidak dikenali");
        });

        it("responds with unknown command for non-admin /voucher in group chat", async () => {
            const { ctx, mockClient, sentTexts } = createMockContext();
            const groupJid = "120363000000000000@g.us";
            const nonAdminParticipant = "628999999999@s.whatsapp.net";

            await handleIncomingMessage(groupJid, false, "/voucher", ctx, nonAdminParticipant);

            expect(mockClient.getVoucherStatus).not.toHaveBeenCalled();
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0].text).toContain("tidak dikenali");
        });
    });

    describe("Buyer Checkout Flow with Vouchers", () => {
        it("prompts for voucher on confirmation summary and applies valid voucher", async () => {
            const { ctx, mockClient, state, sentTexts, sentImages } = createMockContext();
            const buyerJid = "628123456789@s.whatsapp.net";

            // Setup state directly to AWAITING_GAMERTAG
            state.startBuyingFlow(buyerJid);
            state.setCategory(buyerJid, "Regular Pet");
            state.setItem(buyerJid, dummyItems[0]);

            // Buyer submits gamertag
            await handleIncomingMessage(buyerJid, false, "Steve123", ctx);

            // Verify confirmation prompt contains voucher tip
            const lastSent = sentTexts[sentTexts.length - 1];
            expect(lastSent.text).toContain("Punya voucher?");
            expect(state.getSession(buyerJid).step).toBe("AWAITING_CONFIRMATION");

            // Buyer inputs voucher
            await handleIncomingMessage(buyerJid, false, "voucher HEMAT5K", ctx);

            expect(mockClient.validateVoucher).toHaveBeenCalledWith("HEMAT5K", "Dragon Pet");
            const appliedSession = state.getSession(buyerJid);
            expect(appliedSession.appliedVoucher).toBeDefined();
            expect(appliedSession.appliedVoucher?.code).toBe("HEMAT5K");

            const voucherAppliedMsg = sentTexts[sentTexts.length - 1];
            expect(voucherAppliedMsg.text).toContain("HEMAT5K");
            expect(voucherAppliedMsg.text).toContain("20.000");

            // Buyer confirms order with YA
            await handleIncomingMessage(buyerJid, false, "YA", ctx);

            expect(mockClient.createOrder).toHaveBeenCalledWith(
                "Steve123",
                "Dragon Pet",
                buyerJid,
                "HEMAT5K"
            );
            expect(sentImages.length).toBe(1);
            expect(sentImages[0].caption).toContain("HEMAT5K");
            expect(state.getSession(buyerJid).step).toBe("IDLE");
        });

        it("handles invalid or exhausted voucher gracefully without resetting session", async () => {
            const { ctx, mockClient, state, sentTexts } = createMockContext();
            const buyerJid = "628123456789@s.whatsapp.net";

            state.startBuyingFlow(buyerJid);
            state.setCategory(buyerJid, "Regular Pet");
            state.setItem(buyerJid, dummyItems[0]);
            await handleIncomingMessage(buyerJid, false, "Steve123", ctx);

            // Buyer types invalid voucher
            await handleIncomingMessage(buyerJid, false, "voucher SALAH", ctx);

            expect(mockClient.validateVoucher).toHaveBeenCalledWith("SALAH", "Dragon Pet");
            expect(sentTexts[sentTexts.length - 1].text).toContain("tidak valid");
            expect(state.getSession(buyerJid).step).toBe("AWAITING_CONFIRMATION");

            // Buyer confirms anyway with YA
            await handleIncomingMessage(buyerJid, false, "YA", ctx);

            expect(mockClient.createOrder).toHaveBeenCalledWith(
                "Steve123",
                "Dragon Pet",
                buyerJid,
                undefined
            );
            expect(state.getSession(buyerJid).step).toBe("IDLE");
        });
    });
});
