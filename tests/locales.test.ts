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
            "changeItem",
            "featuredBuyNow"
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

    it("should maintain 100% recursive key parity between id.json and en.json without command hints", () => {
        const collectLeafKeys = (obj: Record<string, unknown>, prefix = ""): string[] => {
            const keys: string[] = [];
            for (const [key, val] of Object.entries(obj)) {
                const path = prefix ? `${prefix}.${key}` : key;
                if (val && typeof val === "object" && !Array.isArray(val)) {
                    keys.push(...collectLeafKeys(val as Record<string, unknown>, path));
                } else {
                    expect(typeof val).toBe("string");
                    expect((val as string).trim().length).toBeGreaterThan(0);
                    expect(val as string).not.toMatch(/\/(reprocess|saldo|sync|orders|maintenance|voucher)\b/i);
                    keys.push(path);
                }
            }
            return keys.sort();
        };

        const idKeys = collectLeafKeys(idLocale as unknown as Record<string, unknown>);
        const enKeys = collectLeafKeys(enLocale as unknown as Record<string, unknown>);

        expect(idKeys).toEqual(enKeys);
    });
});
