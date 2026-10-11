import { describe, it, expect, beforeEach } from "bun:test";
import { handleBuyingFlow } from "../../src/flows/buyingFlow";
import { StateManager } from "../../src/state";
import type { BotContext } from "../../src/handlers/message";
import { t } from "../../src/i18n";

describe("Buying Flow: Cancel ('b' / 'batal') vs Back ('k') Navigation", () => {
    let state: StateManager;
    let sentTexts: { jid: string; text: string }[];
    let mockContext: BotContext;
    const testJid = "628123456789@s.whatsapp.net";

    beforeEach(() => {
        state = new StateManager();
        sentTexts = [];

        mockContext = {
            state,
            client: {
                getCatalog: async () => [
                    {
                        id: "item-1",
                        name: "Wolfy",
                        category: "Regular Costume",
                        tokenCost: 1,
                        minecoins: 0,
                        rupiahPrice: 8500,
                        originalPrice: 17000,
                        discountPercent: 50,
                        active: true,
                    },
                ],
            } as any,
            sendText: async (jid: string, text: string) => {
                sentTexts.push({ jid, text });
            },
            sendImage: async (jid: string, _buf: Buffer, caption?: string) => {
                sentTexts.push({ jid, text: caption || "" });
            },
        } as unknown as BotContext;
    });

    describe("Step: AWAITING_GAMERTAG", () => {
        beforeEach(() => {
            state.startBuyingFlow(testJid);
            state.setCategory(testJid, "Regular Costume");
            state.setItem(testJid, {
                id: "item-1",
                name: "Wolfy",
                category: "Regular Costume",
                tokenCost: 1,
                minecoins: 0,
                rupiahPrice: 8500,
                originalPrice: 17000,
                discountPercent: 50,
                active: true,
            });
            // At this point, session is AWAITING_GAMERTAG
            expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        });

        it("typing 'b' should cancel the order session and NOT return to category items", async () => {
            const handled = await handleBuyingFlow(testJid, false, "b", mockContext, "id");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0]!.text).toBe(t("cancelSuccess", "id"));
        });

        it("typing 'B' (uppercase) should cancel the order session", async () => {
            const handled = await handleBuyingFlow(testJid, false, "B", mockContext, "id");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
            expect(sentTexts[0]!.text).toBe(t("cancelSuccess", "id"));
        });

        it("typing 'batal' should cancel the order session", async () => {
            const handled = await handleBuyingFlow(testJid, false, "batal", mockContext, "id");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
            expect(sentTexts[0]!.text).toBe(t("cancelSuccess", "id"));
        });

        it("typing 'k' should go back to item selection", async () => {
            const handled = await handleBuyingFlow(testJid, false, "k", mockContext, "id");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
        });
    });

    describe("Step: AWAITING_CONFIRMATION", () => {
        beforeEach(() => {
            state.startBuyingFlow(testJid);
            state.setCategory(testJid, "Regular Costume");
            state.setItem(testJid, {
                id: "item-1",
                name: "Wolfy",
                category: "Regular Costume",
                tokenCost: 1,
                minecoins: 0,
                rupiahPrice: 8500,
                originalPrice: 17000,
                discountPercent: 50,
                active: true,
            });
            state.setGamertag(testJid, "Steve123");
            // At this point, session is AWAITING_CONFIRMATION
            expect(state.getSession(testJid).step).toBe("AWAITING_CONFIRMATION");
        });

        it("typing 'b' should cancel the order session and NOT return to gamertag input", async () => {
            const handled = await handleBuyingFlow(testJid, false, "b", mockContext, "id");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
            expect(sentTexts[0]!.text).toBe(t("cancelSuccess", "id"));
        });

        it("typing 'batal' should cancel the order session", async () => {
            const handled = await handleBuyingFlow(testJid, false, "batal", mockContext, "id");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
            expect(sentTexts[0]!.text).toBe(t("cancelSuccess", "id"));
        });

        it("typing 'k' should go back to gamertag input (AWAITING_GAMERTAG)", async () => {
            const handled = await handleBuyingFlow(testJid, false, "k", mockContext, "id");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("AWAITING_GAMERTAG");
            expect(sentTexts[0]!.text).toContain("Gamertag Minecraft");
        });
    });

    describe("Step: AWAITING_RETRY_CONFIRMATION", () => {
        beforeEach(() => {
            state.setRetryOrder(testJid, {
                orderId: "ORD-123",
                itemName: "Wolfy",
                oldGamertag: "OldSteve",
                attempts: 1,
            });
            const session = state.getSession(testJid);
            session.step = "AWAITING_RETRY_CONFIRMATION";
        });

        it("typing 'b' should cancel retry and clear retryOrder", async () => {
            const handled = await handleBuyingFlow(testJid, false, "b", mockContext, "id");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.retryOrder).toBeUndefined();
            expect(sentTexts[0]!.text).toBe(t("buying.retryCancelled", "id"));
        });

        it("typing 'k' should return to AWAITING_RETRY_GAMERTAG", async () => {
            const handled = await handleBuyingFlow(testJid, false, "k", mockContext, "id");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("AWAITING_RETRY_GAMERTAG");
        });
    });

    describe("English Language (en): 'b' = Back, 'c' = Cancel", () => {
        beforeEach(() => {
            state.startBuyingFlow(testJid);
            state.setCategory(testJid, "Regular Costume");
            state.setItem(testJid, {
                id: "item-1",
                name: "Wolfy",
                category: "Regular Costume",
                tokenCost: 1,
                minecoins: 0,
                rupiahPrice: 8500,
                originalPrice: 17000,
                discountPercent: 50,
                active: true,
            });
            // At this point, session is AWAITING_GAMERTAG
            expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        });

        it("typing 'b' in English should go BACK to item selection, NOT cancel", async () => {
            const handled = await handleBuyingFlow(testJid, false, "b", mockContext, "en");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
        });

        it("typing 'back' in English should go BACK to item selection", async () => {
            const handled = await handleBuyingFlow(testJid, false, "back", mockContext, "en");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
        });

        it("typing 'c' in English should CANCEL the session", async () => {
            const handled = await handleBuyingFlow(testJid, false, "c", mockContext, "en");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
            expect(sentTexts[0]!.text).toBe(t("cancelSuccess", "en"));
        });

        it("typing 'cancel' in English should CANCEL the session", async () => {
            const handled = await handleBuyingFlow(testJid, false, "cancel", mockContext, "en");
            expect(handled).toBe(true);

            const session = state.getSession(testJid);
            expect(session.step).toBe("IDLE");
            expect(sentTexts[0]!.text).toBe(t("cancelSuccess", "en"));
        });
    });
});
