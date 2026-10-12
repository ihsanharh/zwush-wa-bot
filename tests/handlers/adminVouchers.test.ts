import { describe, it, expect, mock, beforeEach } from "bun:test";
import { handleIncomingMessage } from "../../src/handlers/message";
import { StateManager } from "../../src/state";
import type { VoucherItem } from "../../src/types";

describe("Interactive Admin Voucher Management", () => {
    let mockContext: any;
    let sentTexts: Array<{ jid: string; text: string; mentions?: string[] }>;
    let sentButtons: Array<{ jid: string; payload: any }>;
    let vouchersStore: VoucherItem[];

    const adminGroupJid = "120363413508967055@g.us";
    const adminUser = "628222222222@s.whatsapp.net";

    beforeEach(() => {
        sentTexts = [];
        sentButtons = [];
        vouchersStore = [
            {
                id: "v-1",
                code: "HEMAT10",
                discountType: "PERCENT",
                discountValue: 10,
                maxUses: 50,
                usedCount: 5,
                active: true,
                expiresAt: null,
                createdAt: new Date().toISOString()
            },
            {
                id: "v-2",
                code: "POTONG5K",
                discountType: "FLAT",
                discountValue: 5000,
                maxUses: 100,
                usedCount: 100,
                active: false,
                expiresAt: null,
                createdAt: new Date().toISOString()
            }
        ];

        const state = new StateManager();

        mockContext = {
            state,
            botJid: "628999999999@s.whatsapp.net",
            botLid: "11111111111111@lid",
            adminLogger: {
                getAdminGroupJid: () => adminGroupJid,
                getLogGroupJid: () => "120363413508967056@g.us",
                isAdmin: () => true,
                addAdminUser: mock(() => {})
            },
            client: {
                getBalance: mock(async () => ({
                    bot: { gamertag: "hsuwz", tokens: 100, status: "ONLINE" },
                    summary: {
                        todayOrders: 15,
                        todayCompleted: 12,
                        todayRevenue: 250000,
                        pendingPayment: 2,
                        giftingQueue: 1,
                        insufficientTokens: 0,
                        discountPercent: 10,
                        activeVouchers: 1
                    }
                })),
                listVouchers: mock(async () => [...vouchersStore]),
                createVoucher: mock(async (payload: any) => {
                    const newVoucher: VoucherItem = {
                        id: `v-${Date.now()}`,
                        code: payload.code,
                        discountType: payload.discountType,
                        discountValue: payload.discountValue,
                        maxUses: payload.maxUses ?? null,
                        usedCount: 0,
                        active: true,
                        expiresAt: null,
                        createdAt: new Date().toISOString()
                    };
                    vouchersStore.push(newVoucher);
                    return newVoucher;
                }),
                updateVoucher: mock(async (code: string, payload: any) => {
                    const idx = vouchersStore.findIndex((v) => v.code === code);
                    if (idx === -1) throw new Error("Voucher not found");
                    vouchersStore[idx] = {
                        ...vouchersStore[idx],
                        ...(payload.discountType ? { discountType: payload.discountType } : {}),
                        ...(payload.discountValue !== undefined ? { discountValue: payload.discountValue } : {}),
                        ...(payload.maxUses !== undefined ? { maxUses: payload.maxUses } : {}),
                        ...(payload.active !== undefined ? { active: payload.active } : {})
                    };
                    return vouchersStore[idx];
                }),
                deleteVoucher: mock(async (code: string) => {
                    const idx = vouchersStore.findIndex((v) => v.code === code);
                    if (idx === -1) throw new Error("Voucher not found");
                    vouchersStore.splice(idx, 1);
                    return true;
                })
            },
            sendText: async (jid: string, text: string, mentions?: string[]) => {
                sentTexts.push({ jid, text, mentions });
            },
            sendButtons: async (jid: string, payload: any) => {
                sentButtons.push({ jid, payload });
            }
        };
    });

    it("should open voucher overview menu on 'admin_panel_vouchers'", async () => {
        await handleIncomingMessage(adminGroupJid, false, "admin_panel_vouchers", mockContext, adminUser);

        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("MANAJEMEN VOUCHER & DISKON");
        expect(sentButtons[0]?.payload.buttons.some((b: any) => b.id === "btn_admin_voucher_list")).toBe(true);
        expect(sentButtons[0]?.payload.buttons.some((b: any) => b.id === "btn_admin_voucher_create")).toBe(true);
    });

    it("should display voucher list on 'btn_admin_voucher_list' and allow selecting a voucher", async () => {
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_voucher_list", mockContext, adminUser);

        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("DAFTAR VOUCHER ZWUSH STORE");
        expect(sentButtons[0]?.payload.text).toContain("HEMAT10");
        expect(sentButtons[0]?.payload.text).toContain("POTONG5K");

        // Admin enters 'HEMAT10' to inspect
        await handleIncomingMessage(adminGroupJid, false, "HEMAT10", mockContext, adminUser);

        expect(sentButtons.length).toBe(2);
        expect(sentButtons[1]?.payload.text).toContain("DETAIL VOUCHER: HEMAT10");
        expect(sentButtons[1]?.payload.buttons.some((b: any) => b.id === "btn_admin_voucher_toggle_HEMAT10")).toBe(true);
        expect(sentButtons[1]?.payload.buttons.some((b: any) => b.id === "btn_admin_voucher_edit_menu_HEMAT10")).toBe(true);
        expect(sentButtons[1]?.payload.buttons.some((b: any) => b.id === "btn_admin_voucher_del_confirm_HEMAT10")).toBe(true);
    });

    it("should toggle voucher active status on 'btn_admin_voucher_toggle_HEMAT10'", async () => {
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_voucher_toggle_HEMAT10", mockContext, adminUser);

        expect(mockContext.client.updateVoucher).toHaveBeenCalled();
        const updated = vouchersStore.find((v) => v.code === "HEMAT10");
        expect(updated?.active).toBe(false);
    });

    it("should execute step-by-step interactive creation wizard", async () => {
        // Step 1: Click Buat Voucher
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_voucher_create", mockContext, adminUser);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("BUAT VOUCHER BARU (1/4)");

        // Step 2: Admin inputs Code
        await handleIncomingMessage(adminGroupJid, false, "PROMO25", mockContext, adminUser);
        expect(sentButtons.length).toBe(2);
        expect(sentButtons[1]?.payload.text).toContain("BUAT VOUCHER: PROMO25 (2/4)");

        // Step 3: Admin chooses Percent type
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_voucher_type_percent", mockContext, adminUser);
        expect(sentButtons.length).toBe(3);
        expect(sentButtons[2]?.payload.text).toContain("BUAT VOUCHER: PROMO25 (3/4)");

        // Step 4: Admin inputs Discount 25%
        await handleIncomingMessage(adminGroupJid, false, "25", mockContext, adminUser);
        expect(sentButtons.length).toBe(4);
        expect(sentButtons[3]?.payload.text).toContain("BUAT VOUCHER: PROMO25 (4/4)");

        // Step 5: Admin inputs Quota 30
        await handleIncomingMessage(adminGroupJid, false, "30", mockContext, adminUser);
        expect(mockContext.client.createVoucher).toHaveBeenCalledWith({
            code: "PROMO25",
            discountType: "PERCENT",
            discountValue: 25,
            maxUses: 30
        });

        expect(sentButtons.length).toBe(5);
        expect(sentButtons[4]?.payload.text).toContain("VOUCHER BERHASIL DIBUAT!");
        expect(sentButtons[4]?.payload.text).toContain("PROMO25");

        const inStore = vouchersStore.find((v) => v.code === "PROMO25");
        expect(inStore).toBeDefined();
        expect(inStore?.discountValue).toBe(25);
    });

    it("should allow editing discount value interactively", async () => {
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_voucher_edit_val_HEMAT10", mockContext, adminUser);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("EDIT NILAI DISKON: HEMAT10");

        // Admin inputs new discount value
        await handleIncomingMessage(adminGroupJid, false, "15", mockContext, adminUser);
        expect(mockContext.client.updateVoucher).toHaveBeenCalled();
        const updated = vouchersStore.find((v) => v.code === "HEMAT10");
        expect(updated?.discountValue).toBe(15);
    });

    it("should allow editing quota interactively", async () => {
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_voucher_edit_max_HEMAT10", mockContext, adminUser);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("EDIT KUOTA: HEMAT10");

        // Admin inputs new quota
        await handleIncomingMessage(adminGroupJid, false, "80", mockContext, adminUser);
        expect(mockContext.client.updateVoucher).toHaveBeenCalled();
        const updated = vouchersStore.find((v) => v.code === "HEMAT10");
        expect(updated?.maxUses).toBe(80);
    });

    it("should ask for delete confirmation and perform hard delete", async () => {
        // Confirmation prompt
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_voucher_del_confirm_HEMAT10", mockContext, adminUser);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]?.payload.text).toContain("KONFIRMASI HAPUS VOUCHER");
        expect(sentButtons[0]?.payload.buttons.some((b: any) => b.id === "btn_admin_voucher_del_exec_HEMAT10")).toBe(true);

        // Execute hard delete
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_voucher_del_exec_HEMAT10", mockContext, adminUser);
        expect(mockContext.client.deleteVoucher).toHaveBeenCalledWith("HEMAT10");
        expect(vouchersStore.some((v) => v.code === "HEMAT10")).toBe(false);
    });

    it("should cancel wizard at any step when clicking 'btn_admin_voucher_cancel' or typing 'batal'", async () => {
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_voucher_create", mockContext, adminUser);
        expect(mockContext.state.getSession(adminUser).step).toBe("ADMIN_AWAITING_VOUCHER_CODE");

        // Type 'batal'
        await handleIncomingMessage(adminGroupJid, false, "batal", mockContext, adminUser);
        expect(mockContext.state.getSession(adminUser).step).toBe("IDLE");
        expect(sentButtons.some((b: any) => b.payload.text.includes("dibatalkan"))).toBe(true);
    });
});
