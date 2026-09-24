import { describe, expect, it } from "bun:test";
import { StateManager } from "../src/state";
import type { CatalogItem } from "../src/types";

describe("StateManager", () => {
    const dummyItem: CatalogItem = {
        id: "1",
        name: "Dragon Pet",
        category: "Pets",
        tokenCost: 10,
        minecoins: 660,
        originalPrice: 50000,
        rupiahPrice: 25000,
        discountPercent: 50,
        active: true
    };

    it("should return IDLE for fresh users", () => {
        const mgr = new StateManager();
        const session = mgr.getSession("user1@s.whatsapp.net");
        expect(session.step).toBe("IDLE");
    });

    it("should progress through buying states correctly", () => {
        const mgr = new StateManager();
        const jid = "user2@s.whatsapp.net";

        mgr.startBuyingFlow(jid);
        expect(mgr.getSession(jid).step).toBe("AWAITING_CATEGORY");

        mgr.setCategory(jid, "Pets");
        expect(mgr.getSession(jid).step).toBe("AWAITING_ITEM");
        expect(mgr.getSession(jid).selectedCategory).toBe("Pets");

        mgr.setItem(jid, dummyItem);
        expect(mgr.getSession(jid).step).toBe("AWAITING_GAMERTAG");
        expect(mgr.getSession(jid).selectedItem?.name).toBe("Dragon Pet");

        mgr.setGamertag(jid, "Epic Gamer 123");
        expect(mgr.getSession(jid).step).toBe("AWAITING_CONFIRMATION");
        expect(mgr.getSession(jid).gamertag).toBe("Epic Gamer 123");

        mgr.clear(jid);
        expect(mgr.getSession(jid).step).toBe("IDLE");
    });

    it("should reset state if session expired (> 15 minutes)", () => {
        const mgr = new StateManager(100); // 100ms TTL for testing
        const jid = "user3@s.whatsapp.net";
        mgr.startBuyingFlow(jid);
        expect(mgr.getSession(jid).step).toBe("AWAITING_CATEGORY");

        // Simulate time passing
        const session = mgr.getSession(jid);
        session.lastUpdated = Date.now() - 200;

        expect(mgr.getSession(jid).step).toBe("IDLE");
    });

    it("should persist user language across sessions and defaults to id", () => {
        const mgr = new StateManager(100);
        const jid = "user_lang@s.whatsapp.net";

        expect(mgr.getLanguage(jid)).toBe("id");

        mgr.setLanguage(jid, "en");
        expect(mgr.getLanguage(jid)).toBe("en");
        expect(mgr.getSession(jid).language).toBe("en");

        // Clear session
        mgr.clear(jid);
        expect(mgr.getSession(jid).step).toBe("IDLE");
        // Language should still be remembered!
        expect(mgr.getLanguage(jid)).toBe("en");
    });

    it("should set, retrieve, and clear applied voucher in session", () => {
        const mgr = new StateManager();
        const jid = "voucher_user@s.whatsapp.net";

        expect(mgr.getSession(jid).appliedVoucher).toBeUndefined();

        mgr.setAppliedVoucher(jid, {
            code: "HEMAT",
            discountNominal: 5000,
            finalPrice: 15000
        });

        expect(mgr.getSession(jid).appliedVoucher?.code).toBe("HEMAT");
        expect(mgr.getSession(jid).appliedVoucher?.discountNominal).toBe(5000);
        expect(mgr.getSession(jid).appliedVoucher?.finalPrice).toBe(15000);

        mgr.clearAppliedVoucher(jid);
        expect(mgr.getSession(jid).appliedVoucher).toBeUndefined();
    });
});
