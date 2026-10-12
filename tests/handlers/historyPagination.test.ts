import { describe, it, expect, beforeEach } from "bun:test";
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

    describe("handleIncomingMessage with btn_hist_page_<N>", () => {
        let sentButtons: Array<{ jid: string; content: any }>;
        let sentTexts: Array<{ jid: string; text: string }>;
        let mockContext: any;
        let state: StateManager;

        beforeEach(() => {
            sentButtons = [];
            sentTexts = [];
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
                sendText: async (jid: string, text: string) => {
                    sentTexts.push({ jid, text });
                },
                sendList: async () => {}
            };
        });

        it("should handle btn_history and send page 1", async () => {
            await handleIncomingMessage("628111@s.whatsapp.net", false, "btn_history", mockContext);
            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]!.content.text).toContain("(Hal 1/3)");
        });

        it("should handle btn_hist_page_2 and send page 2", async () => {
            await handleIncomingMessage("628111@s.whatsapp.net", false, "btn_hist_page_2", mockContext);
            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]!.content.text).toContain("(Hal 2/3)");
        });

        it("should send empty message text if user has no orders", async () => {
            mockContext.client.getUserOrders = async () => [];
            await handleIncomingMessage("628111@s.whatsapp.net", false, "btn_history", mockContext);
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0]!.text).toContain("Belum ada riwayat pesanan");
        });

        it("should support server-side pagination seamlessly for >100 orders (e.g. 150 orders)", async () => {
            let requestedOptions: any = null;
            mockContext.client.getUserOrders = async (_jid: string, opts: any) => {
                requestedOptions = opts;
                const page = opts?.page || 1;
                // Simulating 5 orders for the requested page
                const slice = Array.from({ length: 5 }, (_, i) => ({
                    id: `ORD-TEST-${(page - 1) * 5 + i + 1}`,
                    gamertag: `Player${(page - 1) * 5 + i + 1}`,
                    itemName: `Item ${(page - 1) * 5 + i + 1}`,
                    status: "SUCCESS",
                    totalNominal: 10000,
                    createdAt: new Date().toISOString()
                })) as any;
                slice.pagination = {
                    page,
                    limit: 5,
                    total: 150,
                    totalPages: 30
                };
                return slice;
            };

            await handleIncomingMessage("628111@s.whatsapp.net", false, "btn_history", mockContext);
            expect(requestedOptions).toEqual({ page: 1, limit: 5 });
            expect(sentButtons[0]!.content.text).toContain("(Hal 1/30)");
            expect(sentButtons[0]!.content.text).toContain("1. *#ORD-TEST-1*");
            expect(sentButtons[0]!.content.text).toContain("5. *#ORD-TEST-5*");
            const btnIdsP1 = sentButtons[0]!.content.buttons.map((b: any) => b.id);
            expect(btnIdsP1).toContain("btn_hist_page_2");

            sentButtons = [];
            await handleIncomingMessage("628111@s.whatsapp.net", false, "btn_hist_page_2", mockContext);
            expect(requestedOptions).toEqual({ page: 2, limit: 5 });
            expect(sentButtons[0]!.content.text).toContain("(Hal 2/30)");
            expect(sentButtons[0]!.content.text).toContain("6. *#ORD-TEST-6*");
            expect(sentButtons[0]!.content.text).toContain("10. *#ORD-TEST-10*");
            const btnIdsP2 = sentButtons[0]!.content.buttons.map((b: any) => b.id);
            expect(btnIdsP2).toContain("btn_hist_page_1");
            expect(btnIdsP2).toContain("btn_hist_page_3");
        });
    });
});
