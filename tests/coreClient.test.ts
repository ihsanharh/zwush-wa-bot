import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { CoreClient } from "../src/coreClient";

describe("CoreClient", () => {
    const client = new CoreClient("http://mock-core:3000");
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("should fetch and parse catalog items", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                items: [
                    { id: "1", name: "Dragon Pet", category: "Pets", tokenCost: 10, minecoins: 660, originalPrice: 50000, rupiahPrice: 25000, discountPercent: 50, active: true }
                ],
                count: 1
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        const items = await client.getCatalog();
        expect(items.length).toBe(1);
        expect(items[0]?.name).toBe("Dragon Pet");
    });

    it("should create order successfully", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                orderId: "ord_123",
                totalNominal: 25012,
                qrisString: "000201010212...",
                expiresAt: "2026-09-24T12:00:00.000Z"
            }), { status: 201 }))
        ) as unknown as typeof fetch;

        const order = await client.createOrder("Viosca", "Dragon Pet", "62811111111@s.whatsapp.net");
        expect(order.orderId).toBe("ord_123");
        expect(order.totalNominal).toBe(25012);
    });

    it("should throw informative error on non-ok status", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: false,
                message: "Player 'UnknownGuy' not found on The Hive"
            }), { status: 400 }))
        ) as unknown as typeof fetch;

        expect(client.createOrder("UnknownGuy", "Dragon Pet", "user@s.whatsapp.net"))
            .rejects.toThrow("Player 'UnknownGuy' not found on The Hive");
    });

    it("should fetch QR PNG buffer from core server", async () => {
        const dummyBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        global.fetch = mock(() =>
            Promise.resolve(new Response(dummyBytes, {
                status: 200,
                headers: { "Content-Type": "image/png" }
            }))
        ) as unknown as typeof fetch;

        const buffer = await client.getOrderQrPng("ord_123");
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer[0]).toBe(0x89);
        expect(buffer[1]).toBe(0x50);
    });

    it("should fetch user orders for platformUserId", async () => {
        let calledUrl = "";
        global.fetch = mock((url: string) => {
            calledUrl = url;
            return Promise.resolve(new Response(JSON.stringify({
                success: true,
                orders: [
                    { id: "ord_1", gamertag: "Viosca", itemName: "Dragon Pet", status: "QUEUED", totalNominal: 25012 }
                ]
            }), { status: 200 }));
        }) as unknown as typeof fetch;

        const orders = await client.getUserOrders("628111@s.whatsapp.net");
        expect(orders.length).toBe(1);
        expect(orders[0]?.id).toBe("ord_1");
        expect(calledUrl).toContain("/api/orders/user/628111%40s.whatsapp.net");

        await client.getUserOrders("628111@s.whatsapp.net", 20);
        expect(calledUrl).toContain("/api/orders/user/628111%40s.whatsapp.net?limit=20");

        global.fetch = mock((url: string) => {
            calledUrl = url;
            return Promise.resolve(new Response(JSON.stringify({
                success: true,
                orders: [
                    { id: "ord_2", gamertag: "Viosca", itemName: "Dragon Pet", status: "SUCCESS", totalNominal: 25012 }
                ],
                pagination: {
                    page: 2,
                    limit: 5,
                    total: 100,
                    totalPages: 20
                }
            }), { status: 200 }));
        }) as unknown as typeof fetch;

        const paginatedOrders = await client.getUserOrders("628111@s.whatsapp.net", { page: 2, limit: 5 });
        expect(calledUrl).toContain("page=2");
        expect(calledUrl).toContain("limit=5");
        expect(paginatedOrders.pagination).toBeDefined();
        expect(paginatedOrders.pagination?.totalPages).toBe(20);
    });

    it("should retry single order", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                orderId: "ord_1",
                status: "QUEUED"
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        const res = await client.retryOrder("ord_1");
        expect(res.success).toBe(true);
        expect(res.orderId).toBe("ord_1");
    });


    it("should validate voucher", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                valid: true,
                code: "HEMAT",
                discountType: "FLAT",
                discountValue: 5000,
                discountNominal: 5000,
                originalPrice: 20000,
                storePrice: 15000,
                finalPrice: 10000
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        const val = await client.validateVoucher("HEMAT", "Dragon Pet");
        expect(val.valid).toBe(true);
        expect(val.discountNominal).toBe(5000);
        expect(val.finalPrice).toBe(10000);
    });

    it("should pass voucherCode to createOrder when provided", async () => {
        let requestedBody: any = null;
        global.fetch = mock((_url, init) => {
            requestedBody = JSON.parse(init?.body as string);
            return Promise.resolve(new Response(JSON.stringify({
                success: true,
                orderId: "ord_voucher_1",
                totalNominal: 10123,
                qrisString: "000201...",
                expiresAt: "2026-09-25T12:00:00Z"
            }), { status: 201 }));
        }) as unknown as typeof fetch;

        const res = await client.createOrder("Steve", "Dragon Pet", "628999", "HEMAT");
        expect(res.orderId).toBe("ord_voucher_1");
        expect(requestedBody.voucherCode).toBe("HEMAT");
    });

    it("should fetch bot balance and sales summary", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                bot: {
                    gamertag: "hsuwz",
                    tokens: 12,
                    costumeTokens: 5,
                    status: "ONLINE"
                },
                summary: {
                    todayOrders: 10,
                    todayCompleted: 8,
                    todayRevenue: 240000,
                    pendingPayment: 1,
                    giftingQueue: 0,
                    insufficientTokens: 0,
                    discountPercent: 10,
                    activeVouchers: 3
                }
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        const res = await client.getBalance(true);
        expect(res.success).toBe(true);
        expect(res.bot.gamertag).toBe("hsuwz");
        expect(res.bot.tokens).toBe(12);
        expect(res.bot.costumeTokens).toBe(5);
        expect(res.summary.todayRevenue).toBe(240000);
        expect(res.summary.todayCompleted).toBe(8);
    });

    it("should manually complete order", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                orderId: "ORD-123456",
                status: "SUCCESS",
                gamertag: "Wellingsun",
                itemName: "Ultimate Rank",
                totalNominal: 55000,
                message: "Order marked as SUCCESS and buyer notified"
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        const res = await client.manualCompleteOrder("ORD-123456");
        expect(res.success).toBe(true);
        expect(res.orderId).toBe("ORD-123456");
        expect(res.status).toBe("SUCCESS");
        expect(res.gamertag).toBe("Wellingsun");
    });

    it("should pass silent flag to manualCompleteOrder", async () => {
        let sentBody: any = null;
        global.fetch = mock((_url, init) => {
            sentBody = JSON.parse(init?.body as string);
            return Promise.resolve(new Response(JSON.stringify({
                success: true,
                orderId: "ORD-SILENT",
                status: "SUCCESS",
                silent: true
            }), { status: 200 }));
        }) as unknown as typeof fetch;

        const res = await client.manualCompleteOrder("ORD-SILENT", { silent: true });
        expect(res.success).toBe(true);
        expect(sentBody.silent).toBe(true);
    });

    it("should pass silent flag to cancelOrder", async () => {
        let sentBody: any = null;
        global.fetch = mock((_url, init) => {
            sentBody = JSON.parse(init?.body as string);
            return Promise.resolve(new Response(JSON.stringify({
                success: true,
                orderId: "ORD-CANCEL-SILENT",
                status: "CANCELLED",
                silent: true
            }), { status: 200 }));
        }) as unknown as typeof fetch;

        const res = await client.cancelOrder("ORD-CANCEL-SILENT", "Buyer cancelled", { silent: true });
        expect(res.success).toBe(true);
        expect(sentBody.silent).toBe(true);
        expect(sentBody.reason).toBe("Buyer cancelled");
    });
});

