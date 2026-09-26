import { describe, expect, it } from "bun:test";
import {
    t,
    type Language,
    formatRupiah,
    formatStatusNotification
} from "../src/i18n";
import type { OrderNotificationPayload } from "../src/types";

describe("i18n Module", () => {
    it("should format rupiah properly", () => {
        expect(formatRupiah(25000)).toBe("Rp 25.000");
        expect(formatRupiah(55012)).toBe("Rp 55.012");
    });

    it("should provide Indonesian texts by default", () => {
        const text = t("helpMessage", "id");
        expect(text).toContain("BANTUAN ZWUSH STORE");
        expect(text).toContain("/beli");
        expect(text).toContain("admin");
    });

    it("should provide English texts when lang is en", () => {
        const text = t("helpMessage", "en");
        expect(text).toContain("ZWUSH STORE HELP");
        expect(text).toContain("/buy");
        expect(text).toContain("admin team");
    });

    it("should append admin commands to helpMessage when isAdmin is true", () => {
        const idText = t("helpMessage", "id", { isAdmin: true });
        expect(idText).toContain("PERINTAH KHUSUS ADMIN");
        expect(idText).toContain("/admin");
        expect(idText).toContain("/reprocess");

        const enText = t("helpMessage", "en", { isAdmin: true });
        expect(enText).toContain("ADMIN ONLY COMMANDS");
        expect(enText).toContain("/admin");
        expect(enText).toContain("/reprocess");
    });

    it("should provide cross-language hints", () => {
        const idHint = t("crossLanguageHint", "id");
        expect(idHint).toContain("*/beli*");
        expect(idHint).toContain("*/bahasa en*");

        const enHint = t("crossLanguageHint", "en");
        expect(enHint).toContain("*/buy*");
        expect(enHint).toContain("*/language id*");
    });

    it("should provide group checkout redirection text with mention", () => {
        const idGroup = t("groupCheckoutRedirection", "id", { phone: "628111222" });
        expect(idGroup).toContain("@628111222");
        expect(idGroup).toContain("chat pribadi");

        const enGroup = t("groupCheckoutRedirection", "en", { phone: "628111222" });
        expect(enGroup).toContain("@628111222");
        expect(enGroup).toContain("private chat");
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
        const idPrompt = t("voucherPrompt", "id");
        expect(idPrompt).toContain("Punya voucher?");
        const idApplied = t("voucherApplied", "id", { code: "HEMAT", discountNominal: 5000, finalPrice: 15000 });
        expect(idApplied).toContain("HEMAT");
        expect(idApplied).toContain("Rp 5.000");
        expect(idApplied).toContain("Rp 15.000");

        // EN
        const enPrompt = t("voucherPrompt", "en");
        expect(enPrompt).toContain("Have a voucher?");
        const enApplied = t("voucherApplied", "en", { code: "SAVE10", discountNominal: 2000, finalPrice: 18000 });
        expect(enApplied).toContain("SAVE10");
        expect(enApplied).toContain("Rp 2.000");
        expect(enApplied).toContain("Rp 18.000");
    });
});
