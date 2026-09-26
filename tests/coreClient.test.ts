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
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                orders: [
                    { id: "ord_1", gamertag: "Viosca", itemName: "Dragon Pet", status: "QUEUED", totalNominal: 25012 }
                ]
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        const orders = await client.getUserOrders("628111@s.whatsapp.net");
        expect(orders.length).toBe(1);
        expect(orders[0]?.id).toBe("ord_1");
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

    it("should retry all insufficient tokens orders", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                count: 2,
                orderIds: ["ord_1", "ord_2"]
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        const res = await client.retryAllOrders();
        expect(res.success).toBe(true);
        expect(res.count).toBe(2);
    });

    it("should fetch voucher status and active vouchers", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                discountPercent: 40,
                vouchers: [
                    { id: "v1", code: "HEMAT", discountType: "FLAT", discountValue: 5000, usedCount: 1, active: true, createdAt: "2026-09-25T00:00:00Z" }
                ]
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        const res = await client.getVoucherStatus();
        expect(res.success).toBe(true);
        expect(res.discountPercent).toBe(40);
        expect(res.vouchers.length).toBe(1);
        expect(res.vouchers[0]?.code).toBe("HEMAT");
    });

    it("should set store discount", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                discountPercent: 35
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        const newDiscount = await client.setStoreDiscount(35);
        expect(newDiscount).toBe(35);
    });

    it("should create voucher", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                voucher: {
                    id: "v2",
                    code: "NEWPROMO",
                    discountType: "PERCENT",
                    discountValue: 15,
                    maxUses: 10,
                    usedCount: 0,
                    active: true,
                    createdAt: "2026-09-25T00:00:00Z"
                }
            }), { status: 201 }))
        ) as unknown as typeof fetch;

        const v = await client.createVoucher({
            code: "NEWPROMO",
            discountType: "PERCENT",
            discountValue: 15,
            maxUses: 10
        });
        expect(v.code).toBe("NEWPROMO");
        expect(v.discountValue).toBe(15);
    });

    it("should delete voucher", async () => {
        global.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({
                success: true,
                message: "Voucher deleted"
            }), { status: 200 }))
        ) as unknown as typeof fetch;

        await expect(client.deleteVoucher("NEWPROMO")).resolves.toBeUndefined();
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

        const res = await client.getBalance();
        expect(res.success).toBe(true);
        expect(res.bot.gamertag).toBe("hsuwz");
        expect(res.bot.tokens).toBe(12);
        expect(res.summary.todayRevenue).toBe(240000);
        expect(res.summary.todayCompleted).toBe(8);
    });
});
