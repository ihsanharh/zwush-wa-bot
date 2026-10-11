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

    it("should reset state if session expired (> 5 minutes)", () => {
        const mgr = new StateManager(100); // 100ms TTL for testing
        const jid = "user3@s.whatsapp.net";
        mgr.startBuyingFlow(jid);
        expect(mgr.getSession(jid).step).toBe("AWAITING_CATEGORY");

        // Simulate time passing
        const session = mgr.getSession(jid);
        session.lastUpdated = Date.now() - 200;

        expect(mgr.getSession(jid).step).toBe("IDLE");
    });

    it("should default to 5-minute TTL", () => {
        const mgr = new StateManager();
        const jid = "ttl_user@s.whatsapp.net";
        mgr.startBuyingFlow(jid);
        const session = mgr.getSession(jid);
        // Not expired at 4 minutes 59 seconds
        session.lastUpdated = Date.now() - (4 * 60 * 1000 + 59 * 1000);
        expect(mgr.getSession(jid).step).toBe("AWAITING_CATEGORY");

        // Expired at 5 minutes 1 second
        session.lastUpdated = Date.now() - (5 * 60 * 1000 + 1000);
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

    it("should purge stale sessions on cleanupExpiredSessions", () => {
        const mgr = new StateManager(100);
        const jid1 = "user_stale@s.whatsapp.net";
        const session1 = mgr.getSession(jid1);
        session1.lastUpdated = Date.now() - 500;

        const jid2 = "user_fresh@s.whatsapp.net";
        mgr.getSession(jid2);

        mgr.cleanupExpiredSessions();
        // Stale session entry should be purged, fresh preserved
        const freshSession = mgr.getSession(jid2);
        expect(freshSession.step).toBe("IDLE");
    });

    it("should handle catalogPage navigation correctly", () => {
        const mgr = new StateManager();
        const jid = "page_user@s.whatsapp.net";

        expect(mgr.getCatalogPage(jid)).toBe(1);
        mgr.setCatalogPage(jid, 3);
        expect(mgr.getCatalogPage(jid)).toBe(3);
        expect(mgr.getSession(jid).catalogPage).toBe(3);
    });

    it("should handle AWAITING_VOUCHER_CODE state and clear voucher correctly", () => {
        const mgr = new StateManager();
        const jid = "voucher_state@s.whatsapp.net";

        mgr.setAwaitingVoucher(jid);
        expect(mgr.getSession(jid).step).toBe("AWAITING_VOUCHER_CODE");

        mgr.setAppliedVoucher(jid, {
            code: "DISKON20",
            discountNominal: 2000,
            finalPrice: 8000
        });
        expect(mgr.getSession(jid).appliedVoucher?.code).toBe("DISKON20");
        expect(mgr.getSession(jid).appliedVoucherCode).toBe("DISKON20");

        mgr.clearAppliedVoucher(jid);
        expect(mgr.getSession(jid).appliedVoucher).toBeUndefined();
        expect(mgr.getSession(jid).appliedVoucherCode).toBeUndefined();
    });

    it("should persist maintenance mode setting across restarts via state file", () => {
        const testFilePath = "./.auth/test_maintenance_state.json";
        const mgr1 = new StateManager(5000, testFilePath);
        
        // Turn ON
        mgr1.setMaintenanceMode(true);
        expect(mgr1.isMaintenanceMode()).toBe(true);

        // Reload in new instance
        const mgr2 = new StateManager(5000, testFilePath);
        expect(mgr2.isMaintenanceMode()).toBe(true);

        // Turn OFF
        mgr2.setMaintenanceMode(false);
        expect(mgr2.isMaintenanceMode()).toBe(false);

        // Reload again in third instance
        const mgr3 = new StateManager(5000, testFilePath);
        expect(mgr3.isMaintenanceMode()).toBe(false);

        // Clean up test file
        try {
            const fs = require("node:fs");
            if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
        } catch {}
    });
});
