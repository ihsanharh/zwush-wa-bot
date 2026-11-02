import { describe, expect, it } from "bun:test";
import {
    t,
    type Language,
    formatRupiah,
    formatCurrency,
    formatStatusNotification
} from "../src/i18n";
import type { OrderNotificationPayload } from "../src/types";

describe("i18n Module", () => {
    it("should format rupiah properly", () => {
        expect(formatRupiah(25000)).toBe("Rp 25.000");
        expect(formatRupiah(55012)).toBe("Rp 55.012");
    });

    it("should format all QRIS partner currencies correctly", () => {
        expect(formatCurrency(25000, "IDR")).toBe("Rp 25.000");
        expect(formatCurrency(2.49, "USD")).toBe("$2.49");
        expect(formatCurrency(18, "CNY")).toBe("¥18");
        expect(formatCurrency(229, "INR")).toBe("₹229");
        expect(formatCurrency(10.5, "MYR")).toBe("RM 10.50");
        expect(formatCurrency(3.5, "SGD")).toBe("S$3.50");
        expect(formatCurrency(89, "THB")).toBe("฿89");
        expect(formatCurrency(350, "JPY")).toBe("¥350");
        expect(formatCurrency(3200, "KRW")).toBe("₩3.200");
        expect(formatCurrency(120.5, "PHP")).toBe("₱120.50");
        expect(formatCurrency(2.49, "EUR")).toBe("€2.49");
    });


    it("should provide Indonesian texts by default", () => {
        const text = t("helpMessage", "id");
        expect(text).toContain("BANTUAN ZWUSH STORE");
        expect(text).toContain("Beli Kosmetik");
        expect(text).toContain("admin");
    });

    it("should provide English texts when lang is en", () => {
        const text = t("helpMessage", "en");
        expect(text).toContain("ZWUSH STORE HELP");
        expect(text).toContain("Buy Cosmetics");
        expect(text).toContain("admin team");
    });

    it("should append admin panel section to helpMessage when isAdmin is true", () => {
        const idText = t("helpMessage", "id", { isAdmin: true });
        expect(idText).toContain("PANEL KHUSUS ADMIN");
        expect(idText).toContain("Mention (@) bot");

        const enText = t("helpMessage", "en", { isAdmin: true });
        expect(enText).toContain("ADMIN PANEL");
        expect(enText).toContain("Mention (@)");
    });

    it("should format status notification in Indonesian and English", () => {
        const payload: OrderNotificationPayload = {
            orderId: "ORD-99",
            platform: "whatsapp",
            platformUserId: "628111@s.whatsapp.net",
            gamertag: "Steve123",
            itemName: "Dragon Pet",
            status: "SUCCESS"
        };

        const idMsg = formatStatusNotification(payload, "id");
        expect(idMsg).toContain("PESANAN BERHASIL DIKIRIM");
        expect(idMsg).toContain("Steve123");

        const enMsg = formatStatusNotification(payload, "en");
        expect(enMsg).toContain("ORDER DELIVERED SUCCESSFULLY");
        expect(enMsg).toContain("Steve123");
    });

    it("should provide bilingual voucher messages", () => {
        // ID
        const idApplied = t("voucherApplied", "id", { code: "HEMAT", discountNominal: 5000, finalPrice: 15000 });
        expect(idApplied).toContain("HEMAT");
        expect(idApplied).toContain("Rp 5.000");
        expect(idApplied).toContain("Rp 15.000");

        // EN
        const enApplied = t("voucherApplied", "en", { code: "SAVE10", discountNominal: 2000, finalPrice: 18000 });
        expect(enApplied).toContain("SAVE10");
        expect(enApplied).toContain("Rp 2.000");
        expect(enApplied).toContain("Rp 18.000");
    });
});
