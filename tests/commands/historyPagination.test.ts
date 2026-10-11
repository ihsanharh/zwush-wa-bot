import { describe, it, expect, beforeEach } from "bun:test";
import { historyCommand } from "../../src/commands/general/history";
import { buildOrderHistoryButtons } from "../../src/utils/interactiveBuilders";
import { handleIncomingMessage } from "../../src/handlers/message";
import { StateManager } from "../../src/state";
import type { OrderInfo } from "../../src/types";

describe("Order History Pagination", () => {
    const createMockOrders = (count: number): OrderInfo[] => {
        return Array.from({ length: count }, (_, i) => ({
            id: `ORD-TEST-${i + 1}`,
            gamertag: `Player${i + 1}`,
            itemName: `Item ${i + 1}`,
            status: i % 2 === 0 ? "SUCCESS" : "PENDING_PAYMENT",
            totalNominal: 10000 + i * 1000,
            createdAt: new Date().toISOString()
        }));
    };

    describe("buildOrderHistoryButtons", () => {
        it("should format page 1 of 3 properly with next and shop buttons", () => {
            const orders = createMockOrders(12);
            const result = buildOrderHistoryButtons(orders, 1, 5, "id");

            expect(result.text).toContain("(Hal 1/3)");
            expect(result.text).toContain("1. *#ORD-TEST-1*");
            expect(result.text).toContain("5. *#ORD-TEST-5*");
            expect(result.text).not.toContain("6. *#ORD-TEST-6*");

            const btnIds = result.buttons.map((b) => b.id);
            expect(btnIds).toContain("btn_hist_page_2");
            expect(btnIds).toContain("btn_start_buying");
            expect(btnIds).not.toContain("btn_hist_page_0");
            expect(result.buttons.length).toBe(2);
        });

        it("should format middle page 2 of 3 with prev, next, and shop buttons", () => {
            const orders = createMockOrders(12);
            const result = buildOrderHistoryButtons(orders, 2, 5, "id");

            expect(result.text).toContain("(Hal 2/3)");
            expect(result.text).toContain("6. *#ORD-TEST-6*");
            expect(result.text).toContain("10. *#ORD-TEST-10*");
            expect(result.text).not.toContain("1. *#ORD-TEST-1*");

            const btnIds = result.buttons.map((b) => b.id);
            expect(btnIds).toContain("btn_hist_page_1");
            expect(btnIds).toContain("btn_hist_page_3");
            expect(btnIds).toContain("btn_start_buying");
            expect(result.buttons.length).toBe(3);
        });

        it("should format last page 3 of 3 with prev and shop buttons only", () => {
            const orders = createMockOrders(12);
            const result = buildOrderHistoryButtons(orders, 3, 5, "id");

            expect(result.text).toContain("(Hal 3/3)");
            expect(result.text).toContain("11. *#ORD-TEST-11*");
            expect(result.text).toContain("12. *#ORD-TEST-12*");

            const btnIds = result.buttons.map((b) => b.id);
            expect(btnIds).toContain("btn_hist_page_2");
            expect(btnIds).toContain("btn_start_buying");
            expect(btnIds).not.toContain("btn_hist_page_4");
            expect(result.buttons.length).toBe(2);
        });

        it("should format single page (<= 5 orders) with shop button only", () => {
            const orders = createMockOrders(3);
            const result = buildOrderHistoryButtons(orders, 1, 5, "id");

            expect(result.text).toContain("3. *#ORD-TEST-3*");
            const btnIds = result.buttons.map((b) => b.id);
            expect(btnIds).toEqual(["btn_start_buying"]);
        });
    });

    describe("historyCommand execution", () => {
        let sentButtons: Array<{ jid: string; content: any }>;
        let sentTexts: Array<{ jid: string; text: string }>;
        let mockCtx: any;

        beforeEach(() => {
            sentButtons = [];
            sentTexts = [];
            mockCtx = {
                client: {
                    getUserOrders: async () => createMockOrders(12)
                },
                sendButtons: async (jid: string, content: any) => {
                    sentButtons.push({ jid, content });
                },
                sendText: async (jid: string, text: string) => {
                    sentTexts.push({ jid, text });
                }
            };
        });

        it("should send page 1 buttons by default when orders exist", async () => {
            await historyCommand.execute({
                remoteJid: "628111@s.whatsapp.net",
                sender: "628111@s.whatsapp.net",
                args: [],
                rawText: "btn_history",
                isGroup: false,
                isAdmin: false,
                userLang: "id",
                ctx: mockCtx
            });

            expect(sentButtons.length).toBe(1);
            const content = sentButtons[0]!.content;
            expect(content.text).toContain("(Hal 1/3)");
            expect(content.buttons.some((b: any) => b.id === "btn_hist_page_2")).toBe(true);
        });

        it("should send requested page when page argument is provided", async () => {
            await historyCommand.execute({
                remoteJid: "628111@s.whatsapp.net",
                sender: "628111@s.whatsapp.net",
                args: ["2"],
                rawText: "btn_hist_page_2",
                isGroup: false,
                isAdmin: false,
                userLang: "id",
                ctx: mockCtx
            });

            expect(sentButtons.length).toBe(1);
            const content = sentButtons[0]!.content;
            expect(content.text).toContain("(Hal 2/3)");
            expect(content.buttons.some((b: any) => b.id === "btn_hist_page_1")).toBe(true);
            expect(content.buttons.some((b: any) => b.id === "btn_hist_page_3")).toBe(true);
        });

        it("should send empty message text if user has no orders", async () => {
            mockCtx.client.getUserOrders = async () => [];
            await historyCommand.execute({
                remoteJid: "628111@s.whatsapp.net",
                sender: "628111@s.whatsapp.net",
                args: [],
                rawText: "btn_history",
                isGroup: false,
                isAdmin: false,
                userLang: "id",
                ctx: mockCtx
            });

            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0]!.text).toContain("Belum ada riwayat pesanan");
        });
    });

    describe("handleIncomingMessage with btn_hist_page_<N>", () => {
        let sentButtons: Array<{ jid: string; content: any }>;
        let mockContext: any;
        let state: StateManager;

        beforeEach(() => {
            sentButtons = [];
            state = new StateManager();
            state.setMaintenanceMode(false);
            mockContext = {
                state,
                client: {
                    getUserOrders: async () => createMockOrders(12)
                },
                sendButtons: async (jid: string, content: any) => {
                    sentButtons.push({ jid, content });
                },
                sendText: async () => {},
                sendList: async () => {}
            };
        });

        it("should handle btn_hist_page_2 and send page 2", async () => {
            await handleIncomingMessage("628111@s.whatsapp.net", false, "btn_hist_page_2", mockContext);
            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]!.content.text).toContain("(Hal 2/3)");
        });
    });
});
