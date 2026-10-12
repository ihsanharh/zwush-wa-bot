import { describe, expect, it } from "bun:test";
import idLocale from "../src/locales/id.json";
import enLocale from "../src/locales/en.json";

describe("Locale keys validation", () => {
    it("should have all required clean buttons and interactive keys in id and en", () => {
        const requiredButtons = [
            "browseCatalog",
            "orderHistory",
            "settingsAndInfo",
            "confirmOrder",
            "applyVoucher",
            "removeVoucher",
            "modifyMenu",
            "checkPayment",
            "cancelOrder",
            "nextPage",
            "nextPageShort",
            "prevPage",
            "changeItem"
        ];

        for (const key of requiredButtons) {
            expect((idLocale as any).buttons?.[key]).toBeDefined();
            expect((enLocale as any).buttons?.[key]).toBeDefined();
            // Verify buttons do not contain unnecessary leading emojis
            expect((idLocale as any).buttons?.[key]).not.toMatch(/^[^\w\s]/);
            expect((enLocale as any).buttons?.[key]).not.toMatch(/^[^\w\s]/);
        }

        const requiredInteractive = [
            "categoryListTitle",
            "categoryListDesc",
            "categoryListBtn",
            "itemsListTitle",
            "itemsListBtn",
            "navSectionTitle",
            "navNextPage",
            "navPrevPage",
            "navChangeCategory",
            "voucherInputPrompt",
            "modifyMenuTitle",
            "modifyMenuDesc",
            "modifyGamertag",
            "modifyItem",
            "modifyCancel",
            "settingsTitle",
            "settingsDesc",
            "settingsBtn",
            "faqTitle",
            "faqDesc",
            "switchLangId",
            "switchLangEn",
            "switchLangIdDesc",
            "switchLangEnDesc"
        ];

        for (const key of requiredInteractive) {
            expect((idLocale as any).interactive?.[key]).toBeDefined();
            expect((enLocale as any).interactive?.[key]).toBeDefined();
        }
    });
});
