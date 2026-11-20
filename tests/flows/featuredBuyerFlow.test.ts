import { describe, it, expect, beforeEach, mock } from "bun:test";
import { handleIncomingMessage, type BotContext } from "../../src/handlers/message";
import { StateManager } from "../../src/state";
import type { CatalogItem, FeaturedBundleConfig } from "../../src/types";

describe("Buyer Featured Bundle Greeting & Direct Checkout", () => {
    let state: StateManager;
    let sentTexts: { jid: string; text: string }[];
    let sentButtons: { jid: string; payload: any }[];
    let catalogItems: CatalogItem[];
    let featuredConfig: FeaturedBundleConfig;
    let getFeaturedError: Error | null;
    let mockContext: BotContext;

    const buyerJid = "628123456789@s.whatsapp.net";
    const promoJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    beforeEach(() => {
        state = new StateManager();
        state.setMaintenanceMode(false);
        sentTexts = [];
        sentButtons = [];
        getFeaturedError = null;

        catalogItems = [
            {
                id: "bf-1",
                name: "Black Friday Bundle",
                category: "Bundles",
                tokenCost: 6,
                minecoins: 1000,
                originalPrice: 60000,
                rupiahPrice: 45000,
                displayPrice: 45000,
                currency: "IDR",
                discountPercent: 25,
                active: true
            },
            {
                id: "pet-1",
                name: "Dragon Pet",
                category: "Regular Pet",
                tokenCost: 10,
                minecoins: 1720,
                originalPrice: 50000,
                rupiahPrice: 37500,
                discountPercent: 25,
                active: true
            }
        ];

        featuredConfig = {
            configured: true,
            enabled: true,
            available: true,
            unavailableReason: null,
            itemName: "Black Friday Bundle",
            customMessage: "🔥 BLACK FRIDAY BUNDLE IS HERE!",
            hasImage: true,
            imageMimetype: "image/jpeg",
            updatedAt: "2026-11-20T16:00:00.000Z",
            item: catalogItems[0]!
        };

        mockContext = {
            state,
            client: {
                getCatalog: mock(async (currency?: string) => {
                    if (currency === "USD") {
                        return catalogItems.map((i) => ({
                            ...i,
                            currency: "USD",
                            originalPrice: 3.99,
                            displayPrice: 2.99
                        }));
                    }
                    return catalogItems;
                }),
                getFeaturedBundle: mock(async (currency?: string) => {
                    if (getFeaturedError) throw getFeaturedError;
                    if (currency === "USD" && featuredConfig.item) {
                        return {
                            ...featuredConfig,
                            item: {
                                ...featuredConfig.item,
                                currency: "USD",
                                originalPrice: 3.99,
                                displayPrice: 2.99
                            }
                        };
                    }
                    return featuredConfig;
                }),
                getFeaturedBundleImage: mock(async () => ({ buffer: promoJpeg, mimetype: "image/jpeg" }))
            } as any,
            sendText: async (jid: string, text: string) => {
                sentTexts.push({ jid, text });
            },
            sendButtons: async (jid: string, payload: any) => {
                sentButtons.push({ jid, payload });
                return { key: { id: `msg-btn-${sentButtons.length}` } };
            },
            sendImage: async () => ({})
        };
    });

    it("sends Featured Bundle card first then Welcome card when enabled and available", async () => {
        await handleIncomingMessage(buyerJid, false, "hi", mockContext);

        expect(sentButtons.length).toBe(2);

        const featuredCard = sentButtons[0]!.payload;
        expect(featuredCard.headerImage).toEqual(promoJpeg);
        expect(featuredCard.headerImageMimetype).toBe("image/jpeg");
        expect(featuredCard.text).toContain("🔥 BLACK FRIDAY BUNDLE IS HERE!");
        expect(featuredCard.text).toContain("Black Friday Bundle");
        expect(featuredCard.text).toContain("Rp 45.000");
        expect(featuredCard.text).toContain("Diskon 25%");
        expect(featuredCard.buttons).toEqual([
            { id: "btn_featured_buy_bf-1", text: "Beli Sekarang" }
        ]);

        const welcomeCard = sentButtons[1]!.payload;
        expect(welcomeCard.text).toContain("Selamat datang");
        expect(welcomeCard.buttons.some((b: any) => b.id === "btn_start_buying")).toBe(true);
    });

    it("localizes Featured Bundle card for EN / USD buyer", async () => {
        state.setLanguage(buyerJid, "en");
        state.setCurrency(buyerJid, "USD");

        await handleIncomingMessage(buyerJid, false, "hi", mockContext);

        expect(sentButtons.length).toBe(2);
        const featuredCard = sentButtons[0]!.payload;
        expect(featuredCard.text).toContain("$2.99");
        expect(featuredCard.text).toContain("25% Off");
        expect(featuredCard.buttons).toEqual([
            { id: "btn_featured_buy_bf-1", text: "Buy Now" }
        ]);
        expect(featuredCard.interactiveMessage.footer.text).toContain("Featured");
    });

    it("fails open and sends only default Welcome card when disabled, unavailable, or error", async () => {
        // 1. Disabled
        featuredConfig.enabled = false;
        await handleIncomingMessage(buyerJid, false, "hi", mockContext);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]!.payload.buttons.some((b: any) => b.id === "btn_start_buying")).toBe(true);

        // 2. Enabled but unavailable
        state.setLastGreetingAt(buyerJid, Date.now() - 15000);
        sentButtons = [];
        featuredConfig.enabled = true;
        featuredConfig.available = false;
        await handleIncomingMessage(buyerJid, false, "hi", mockContext);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]!.payload.buttons.some((b: any) => b.id === "btn_start_buying")).toBe(true);

        // 3. Throws error
        state.setLastGreetingAt(buyerJid, Date.now() - 15000);
        sentButtons = [];
        featuredConfig.available = true;
        getFeaturedError = new Error("Core service timeout");
        await handleIncomingMessage(buyerJid, false, "hi", mockContext);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]!.payload.buttons.some((b: any) => b.id === "btn_start_buying")).toBe(true);
    });

    it("routes btn_featured_buy_<id> to Gamertag prompt when no default gamertag is saved", async () => {
        await handleIncomingMessage(buyerJid, false, "btn_featured_buy_bf-1", mockContext);

        expect(state.getSession(buyerJid).step).toBe("AWAITING_GAMERTAG");
        expect(state.getSession(buyerJid).selectedItem?.name).toBe("Black Friday Bundle");
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]!.payload.text).toContain("Gamertag");
    });

    it("routes btn_featured_buy_<id> straight to Order Confirmation when Default Gamertag is saved", async () => {
        state.setDefaultGamertag(buyerJid, "ProSteve99");

        await handleIncomingMessage(buyerJid, false, "btn_featured_buy_bf-1", mockContext);

        expect(state.getSession(buyerJid).step).toBe("AWAITING_CONFIRMATION");
        expect(state.getSession(buyerJid).gamertag).toBe("ProSteve99");
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]!.payload.text).toContain("KONFIRMASI PESANAN");
        expect(sentButtons[0]!.payload.text).toContain("ProSteve99");
    });

    it("shows localized unavailable notice + Browse Catalog when clicking btn_featured_buy for inactive item", async () => {
        catalogItems[0]!.active = false;

        await handleIncomingMessage(buyerJid, false, "btn_featured_buy_bf-1", mockContext);

        expect(state.getSession(buyerJid).step).toBe("IDLE");
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]!.payload.text).toContain("sudah berakhir");
        expect(sentButtons[0]!.payload.buttons).toEqual([
            { id: "btn_start_buying", text: "Beli Kosmetik" }
        ]);
    });

    it("does not interrupt or overwrite an active pending order when clicking btn_featured_buy_<id>", async () => {
        state.setActiveOrderId(buyerJid, "ORD-ACTIVE1");

        await handleIncomingMessage(buyerJid, false, "btn_featured_buy_bf-1", mockContext);

        expect(state.getActiveOrderId(buyerJid)).toBe("ORD-ACTIVE1");
        expect(state.getSession(buyerJid).step).toBe("IDLE");
        expect(sentButtons.length).toBe(0);
    });
});
