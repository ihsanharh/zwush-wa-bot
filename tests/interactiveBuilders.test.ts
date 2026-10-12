import { describe, expect, it } from "bun:test";
import {
    buildCategoryListMenu,
    buildPaginatedItemListMenu,
    buildGamertagPromptButtons,
    buildOrderConfirmationButtons,
    buildModifyOrderListMenu,
    buildInvoiceButtons,
    buildAdminOrderActionButtons,
    buildAdminOrderFailureButtons,
    buildUserOrderFailureButtons,
    buildAdminSupportSolvedButtons,
    buildWelcomeButtons,
    buildSettingsListMenu,
    buildVoucherPromptButtons,
    buildGamertagChangePromptButtons,
    buildOrderCancelledButtons,
    buildOrderSuccessButtons,
    buildPaymentPendingButtons,
    buildOrderExpiredButtons
} from "../src/utils/interactiveBuilders";
import type { CategoryDefinition } from "../src/utils/categories";
import type { CatalogItem } from "../src/types";

describe("interactiveBuilders", () => {
    const sampleCategories: CategoryDefinition[] = [
        { id: "1", dbCategory: "Minecoins", displayName: "Minecoins", displayPrice: "Mulai Rp 10rb" },
        { id: "2", dbCategory: "Cape", displayName: "Cape", displayPrice: "Mulai Rp 20rb" }
    ];

    const sampleItems: CatalogItem[] = [
        {
            id: "SKU1",
            sku: "SKU1",
            name: "1350 Minecoins",
            tokenCost: 10,
            minecoins: 1350,
            originalPrice: 25000,
            rupiahPrice: 20000,
            discountPercent: 20,
            active: true,
            category: "Minecoins"
        },
        {
            id: "SKU2",
            sku: "SKU2",
            name: "3300 Minecoins",
            tokenCost: 20,
            minecoins: 3300,
            originalPrice: 50000,
            rupiahPrice: 45000,
            discountPercent: 10,
            active: true,
            category: "Minecoins"
        }
    ];

    it("should build category list menu with clean labels", () => {
        const payload = buildCategoryListMenu(sampleCategories, "id");
        expect(payload.listMessage).toBeDefined();
        expect(payload.listMessage.sections.length).toBe(1);
        expect(payload.listMessage.sections[0].rows.length).toBe(2);
        expect(payload.listMessage.sections[0].rows[0].rowId).toBe("cat_Minecoins");
        expect(payload.listMessage.sections[0].rows[0].title).toBe("Minecoins");
    });

    it("should build paginated item list menu with navigation", () => {
        const payload = buildPaginatedItemListMenu(sampleItems, sampleCategories[0]!, 1, 1, "id");
        expect(payload.listMessage).toBeDefined();
        // Section 1: Item rows (1 item due to pageSize 1)
        expect(payload.listMessage.sections[0].rows.length).toBe(1);
        expect(payload.listMessage.sections[0].rows[0].rowId).toBe("item_SKU1");
        // Section 2: Navigasi (Next page + Change category - no cancel order)
        expect(payload.listMessage.sections[1].rows.length).toBe(2);
        expect(payload.listMessage.sections[1].rows[0].rowId).toBe("nav_page_2");
        expect(payload.listMessage.sections[1].rows[1].rowId).toBe("nav_change_cat");
    });

    it("should build order confirmation buttons with max 3 buttons without emojis", () => {
        const withoutVoucher = buildOrderConfirmationButtons("Ringkasan", false, "id");
        const buttons1 = withoutVoucher.interactiveMessage.nativeFlowMessage.buttons;
        expect(buttons1.length).toBe(3);
        const params0 = JSON.parse(buttons1[0].buttonParamsJson);
        const params1 = JSON.parse(buttons1[1].buttonParamsJson);
        const params2 = JSON.parse(buttons1[2].buttonParamsJson);
        expect(params0.id).toBe("btn_confirm_order");
        expect(params0.display_text).toBe("Lanjut Bayar");
        expect(params1.id).toBe("btn_open_voucher");
        expect(params1.display_text).toBe("Pakai Voucher");
        expect(params2.id).toBe("btn_modify_menu");
        expect(params2.display_text).toBe("Ubah / Batalkan");

        // When voucher is active
        const withVoucher = buildOrderConfirmationButtons("Ringkasan", true, "id");
        const buttons2 = withVoucher.interactiveMessage.nativeFlowMessage.buttons;
        const vParams1 = JSON.parse(buttons2[1].buttonParamsJson);
        expect(vParams1.id).toBe("btn_remove_voucher");
        expect(vParams1.display_text).toBe("Hapus Voucher");
    });

    it("should build modify order list menu", () => {
        const payload = buildModifyOrderListMenu("id");
        expect(payload.listMessage).toBeDefined();
        expect(payload.listMessage.sections[0].rows.length).toBe(3);
        expect(payload.listMessage.sections[0].rows[0].rowId).toBe("opt_change_gamertag");
        expect(payload.listMessage.sections[0].rows[1].rowId).toBe("opt_change_item");
        expect(payload.listMessage.sections[0].rows[2].rowId).toBe("opt_cancel_order");
    });

    it("should build invoice buttons with optional QR header image", () => {
        const payload = buildInvoiceButtons("Invoice details", "id");
        const buttons = payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(buttons.length).toBe(2);
        const p0 = JSON.parse(buttons[0].buttonParamsJson);
        const p1 = JSON.parse(buttons[1].buttonParamsJson);
        expect(p0.id).toBe("btn_check_payment");
        expect(p0.display_text).toBe("Cek Pembayaran");
        expect(p1.id).toBe("btn_cancel_order");
        expect(p1.display_text).toBe("Batalkan Pesanan");
        expect(payload.headerImage).toBeUndefined();

        const fakeQr = Buffer.from("fake-qr");
        const payloadWithQr = buildInvoiceButtons("Invoice details", "id", fakeQr);
        expect(payloadWithQr.headerImage).toBe(fakeQr);
    });


    it("should build admin order action buttons for new orders (paid and done)", () => {
        const payload = buildAdminOrderActionButtons("ORD-12345", "id");
        const buttons = payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(buttons.length).toBe(2);
        const p0 = JSON.parse(buttons[0].buttonParamsJson);
        const p1 = JSON.parse(buttons[1].buttonParamsJson);
        expect(p0.id).toBe("btn_admin_paid_ORD-12345");
        expect(p0.display_text).toBe("Mark as paid");
        expect(p1.id).toBe("btn_admin_done_ORD-12345");
        expect(p1.display_text).toBe("Mark as completed");
    });

    it("should build admin order failure retry buttons", () => {
        const payload = buildAdminOrderFailureButtons("ORD-12345", "Token Gibot habis", "id");
        const buttons = payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(buttons.length).toBe(1);
        const p0 = JSON.parse(buttons[0].buttonParamsJson);
        expect(p0.id).toBe("btn_admin_reprocess_ORD-12345");
        expect(p0.display_text).toBe("Retry");
        expect(payload.text).toContain("Token Gibot habis");
    });

    it("should build user order failure buttons with live chat button", () => {
        const payload = buildUserOrderFailureButtons("ORD-12345", "Gibot error", "id");
        const buttons = payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(buttons.length).toBe(1);
        const p0 = JSON.parse(buttons[0].buttonParamsJson);
        expect(p0.id).toBe("btn_start_livechat_ORD-12345");
        expect(p0.display_text).toContain("Mulai Live Chat");
        expect(payload.text).toContain("ORD-12345");
    });

    it("should build admin support solved button", () => {
        const payload = buildAdminSupportSolvedButtons("628123456789@s.whatsapp.net", "id");
        const buttons = payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(buttons.length).toBe(1);
        const p0 = JSON.parse(buttons[0].buttonParamsJson);
        expect(p0.id).toBe("btn_admin_solved_628123456789@s.whatsapp.net");
        expect(p0.display_text).toContain("Solved");
    });

    it("should build welcome buttons with 3 quick-reply options (Catalog, History, Settings)", () => {
        const payload = buildWelcomeButtons("id");
        const buttons = payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(buttons.length).toBe(3);
        const p0 = JSON.parse(buttons[0].buttonParamsJson);
        const p1 = JSON.parse(buttons[1].buttonParamsJson);
        const p2 = JSON.parse(buttons[2].buttonParamsJson);
        expect(p0.id).toBe("btn_start_buying");
        expect(p0.display_text).toBe("Beli Kosmetik");
        expect(p1.id).toBe("btn_history");
        expect(p1.display_text).toBe("Riwayat Pesanan");
        expect(p2.id).toBe("btn_settings");
        expect(p2.display_text).toBe("Pengaturan & Info");
    });

    it("should build settings list menu without exposing support button", () => {
        const payload = buildSettingsListMenu("id");
        expect(payload.listMessage).toBeDefined();
        const rows = payload.listMessage.sections[0].rows;
        expect(rows.length).toBe(2);
        expect(rows[0].rowId).toBe("act_switch_lang");
        expect(rows[1].rowId).toBe("act_view_faq");
        // Verify no CS/support row exists in settings drawer
        const rowIds = rows.map((r: any) => r.rowId);
        expect(rowIds).not.toContain("btn_support_confirm");
    });

    it("should build gamertag prompt buttons with change item and cancel order", () => {
        const payload = buildGamertagPromptButtons("Ketik gamertag", "id");
        const buttons = payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(buttons.length).toBe(2);
        const p0 = JSON.parse(buttons[0].buttonParamsJson);
        const p1 = JSON.parse(buttons[1].buttonParamsJson);
        expect(p0.id).toBe("btn_modify_change_item");
        expect(p0.display_text).toBe("Ganti Item");
        expect(p1.id).toBe("btn_cancel_order");
        expect(p1.display_text).toBe("Batalkan Pesanan");
        expect(payload.headerImage).toBeUndefined();
        expect(payload.interactiveMessage.header).toBeUndefined();
    });

    it("should attach headerImage buffer or pre-uploaded descriptor in buildGamertagPromptButtons", () => {
        const dummyBuf = Buffer.from("image-bytes");
        const withBuf = buildGamertagPromptButtons("Ketik gamertag", "id", dummyBuf);
        expect(withBuf.headerImage).toBe(dummyBuf);

        const uploadedDesc = {
            url: "https://mmg.whatsapp.net/d/f/abc.enc",
            directPath: "/v/t62.7118-24/abc.enc",
            mediaKey: new Uint8Array([1, 2, 3])
        };
        const withDesc = buildGamertagPromptButtons("Ketik gamertag", "id", uploadedDesc);
        expect(withDesc.interactiveMessage.header).toBeDefined();
        expect(withDesc.interactiveMessage.header.hasMediaAttachment).toBe(true);
        expect(withDesc.interactiveMessage.header.imageMessage).toBe(uploadedDesc);
    });

    it("should build voucher prompt buttons with localized cancel button and no legacy buttonsMessage", () => {
        const payloadId = buildVoucherPromptButtons("Masukkan voucher:", "id");
        expect(payloadId.buttons.length).toBe(1);
        expect(payloadId.buttons[0]!.id).toBe("btn_cancel_voucher");
        expect(payloadId.buttons[0]!.text).toBe("Batal");
        expect((payloadId as any).buttonsMessage).toBeUndefined();
        const pId = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        expect(pId.display_text).toBe("Batal");

        const payloadEn = buildVoucherPromptButtons("Enter voucher:", "en");
        expect(payloadEn.buttons[0]!.text).toBe("Cancel");
        expect((payloadEn as any).buttonsMessage).toBeUndefined();
        const pEn = JSON.parse(payloadEn.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        expect(pEn.display_text).toBe("Cancel");
    });

    it("should build gamertag change prompt buttons with localized cancel button", () => {
        const payloadId = buildGamertagChangePromptButtons("Masukkan gamertag:", "id");
        expect(payloadId.buttons.length).toBe(1);
        expect(payloadId.buttons[0]!.id).toBe("btn_cancel_gamertag");
        expect(payloadId.buttons[0]!.text).toBe("Batal");
        const pId = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        expect(pId.display_text).toBe("Batal");

        const payloadEn = buildGamertagChangePromptButtons("Enter gamertag:", "en");
        expect(payloadEn.buttons[0]!.text).toBe("Cancel");
        const pEn = JSON.parse(payloadEn.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        expect(pEn.display_text).toBe("Cancel");
    });

    it("should build order cancelled buttons with Beli Kosmetik and Riwayat Pesanan", () => {
        const payloadId = buildOrderCancelledButtons("Pesanan telah dibatalkan.", "id");
        expect(payloadId.buttons.length).toBe(2);
        expect(payloadId.buttons[0]!.id).toBe("btn_start_buying");
        expect(payloadId.buttons[0]!.text).toBe("Beli Kosmetik");
        expect(payloadId.buttons[1]!.id).toBe("btn_history");
        expect(payloadId.buttons[1]!.text).toBe("Riwayat Pesanan");

        const p0 = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        const p1 = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[1].buttonParamsJson);
        expect(p0.id).toBe("btn_start_buying");
        expect(p0.display_text).toBe("Beli Kosmetik");
        expect(p1.id).toBe("btn_history");
        expect(p1.display_text).toBe("Riwayat Pesanan");

        const payloadEn = buildOrderCancelledButtons("Order cancelled.", "en");
        expect(payloadEn.buttons[0]!.text).toBe("Buy Cosmetics");
        expect(payloadEn.buttons[1]!.text).toBe("Order History");
    });

    it("should build order success buttons with Beli Lagi and Riwayat Pesanan", () => {
        const payloadId = buildOrderSuccessButtons("Pesanan telah berhasil dikirim.", "id");
        expect(payloadId.buttons.length).toBe(2);
        expect(payloadId.buttons[0]!.id).toBe("btn_start_buying");
        expect(payloadId.buttons[0]!.text).toBe("Beli Lagi");
        expect(payloadId.buttons[1]!.id).toBe("btn_history");
        expect(payloadId.buttons[1]!.text).toBe("Riwayat Pesanan");

        const p0 = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        const p1 = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[1].buttonParamsJson);
        expect(p0.id).toBe("btn_start_buying");
        expect(p0.display_text).toBe("Beli Lagi");
        expect(p1.id).toBe("btn_history");
        expect(p1.display_text).toBe("Riwayat Pesanan");

        const payloadEn = buildOrderSuccessButtons("Order delivered successfully.", "en");
        expect(payloadEn.buttons[0]!.text).toBe("Buy Again");
        expect(payloadEn.buttons[1]!.text).toBe("Order History");
    });

    it("should build payment pending buttons with Cek Pembayaran and Batalkan Pesanan", () => {
        const payloadId = buildPaymentPendingButtons("Pembayaran belum masuk.", "id");
        expect(payloadId.buttons.length).toBe(2);
        expect(payloadId.buttons[0]!.id).toBe("btn_check_payment");
        expect(payloadId.buttons[0]!.text).toBe("Cek Pembayaran");
        expect(payloadId.buttons[1]!.id).toBe("btn_cancel_order");
        expect(payloadId.buttons[1]!.text).toBe("Batalkan Pesanan");

        const p0 = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        const p1 = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[1].buttonParamsJson);
        expect(p0.id).toBe("btn_check_payment");
        expect(p0.display_text).toBe("Cek Pembayaran");
        expect(p1.id).toBe("btn_cancel_order");
        expect(p1.display_text).toBe("Batalkan Pesanan");

        const payloadEn = buildPaymentPendingButtons("Payment not detected.", "en");
        expect(payloadEn.buttons[0]!.text).toBe("Check Payment");
        expect(payloadEn.buttons[1]!.text).toBe("Cancel Order");
    });

    it("should build order expired buttons with Beli Kosmetik and Riwayat Pesanan", () => {
        const payloadId = buildOrderExpiredButtons("Pesanan telah kedaluwarsa.", "id");
        expect(payloadId.buttons.length).toBe(2);
        expect(payloadId.buttons[0]!.id).toBe("btn_start_buying");
        expect(payloadId.buttons[0]!.text).toBe("Beli Kosmetik");
        expect(payloadId.buttons[1]!.id).toBe("btn_history");
        expect(payloadId.buttons[1]!.text).toBe("Riwayat Pesanan");

        const p0 = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[0].buttonParamsJson);
        const p1 = JSON.parse(payloadId.interactiveMessage.nativeFlowMessage.buttons[1].buttonParamsJson);
        expect(p0.id).toBe("btn_start_buying");
        expect(p0.display_text).toBe("Beli Kosmetik");
        expect(p1.id).toBe("btn_history");
        expect(p1.display_text).toBe("Riwayat Pesanan");

        const payloadEn = buildOrderExpiredButtons("Order expired.", "en");
        expect(payloadEn.buttons[0]!.text).toBe("Buy Cosmetics");
        expect(payloadEn.buttons[1]!.text).toBe("Order History");
    });
});
