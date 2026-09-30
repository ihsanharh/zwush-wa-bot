import { describe, expect, it, mock } from "bun:test";
import { normalizeOrderId, parseOrderArgs, resolveTargetOrderId } from "../../src/commands/orderHelper";
import { paidCommand } from "../../src/commands/admin/paid";
import { reprocessCommand } from "../../src/commands/admin/reprocess";
import type { CommandContext } from "../../src/commands/types";

describe("Order Helper & Admin Commands (/paid, /reprocess)", () => {
    describe("orderHelper utilities", () => {
        it("should normalize order IDs correctly", () => {
            expect(normalizeOrderId("ORD-123456")).toBe("ORD-123456");
            expect(normalizeOrderId("ord-123456")).toBe("ORD-123456");
            expect(normalizeOrderId("#ORD-123456")).toBe("ORD-123456");
            expect(normalizeOrderId("123456")).toBe("ORD-123456");
            expect(normalizeOrderId("#123456")).toBe("ORD-123456");
        });

        it("should parse order args with silent flags and order ID", () => {
            const res1 = parseOrderArgs(["ORD-123456", "-s"]);
            expect(res1.isSilent).toBe(true);
            expect(res1.isAll).toBe(false);
            expect(res1.orderId).toBe("ORD-123456");

            const res2 = parseOrderArgs(["-s", "ORD-123456"]);
            expect(res2.isSilent).toBe(true);
            expect(res2.isAll).toBe(false);
            expect(res2.orderId).toBe("ORD-123456");

            const res3 = parseOrderArgs(["silent", "123456"]);
            expect(res3.isSilent).toBe(true);
            expect(res3.isAll).toBe(false);
            expect(res3.orderId).toBe("ORD-123456");

            const res4 = parseOrderArgs(["all", "-s"]);
            expect(res4.isSilent).toBe(true);
            expect(res4.isAll).toBe(true);
            expect(res4.orderId).toBeNull();

            const res5 = parseOrderArgs(["-s"]);
            expect(res5.isSilent).toBe(true);
            expect(res5.isAll).toBe(false);
            expect(res5.orderId).toBeNull();
        });

        it("should resolve target order from latest orders in CoreClient", async () => {
            const mockClient = {
                listOrders: mock(async () => ({
                    count: 3,
                    orders: [
                        { id: "ORD-NEW", status: "SUCCESS" },
                        { id: "ORD-PENDING", status: "PENDING_PAYMENT" },
                        { id: "ORD-FAIL", status: "FAILED" },
                    ]
                }))
            };

            // Prefers PENDING_PAYMENT
            const targetPending = await resolveTargetOrderId(
                mockClient,
                { isAll: false, isSilent: false, orderId: null, rawTokens: [] },
                { preferredStatuses: ["PENDING_PAYMENT"] }
            );
            expect(targetPending?.orderId).toBe("ORD-PENDING");

            // Prefers FAILED
            const targetFailed = await resolveTargetOrderId(
                mockClient,
                { isAll: false, isSilent: false, orderId: null, rawTokens: [] },
                { preferredStatuses: ["FAILED"] }
            );
            expect(targetFailed?.orderId).toBe("ORD-FAIL");

            // Fallback to most recent when no preferred matches
            const targetRecent = await resolveTargetOrderId(
                mockClient,
                { isAll: false, isSilent: false, orderId: null, rawTokens: [] },
                { preferredStatuses: ["QUEUED"] }
            );
            expect(targetRecent?.orderId).toBe("ORD-NEW");
        });
    });

    describe("/paid command enhancements", () => {
        it("should mark specific order as paid silently with -s", async () => {
            let sentText = "";
            const markPaidMock = mock(async (id: string, options?: { silent?: boolean }) => ({
                success: true,
                orderId: id,
                status: "QUEUED",
                gamertag: "Buyer1",
                itemName: "Ultimate Rank",
                totalNominal: 55000,
                silent: options?.silent ?? false,
            }));

            const mockCtx: CommandContext = {
                remoteJid: "admin@s.whatsapp.net",
                sender: "admin@s.whatsapp.net",
                args: ["ORD-PAID-1", "-s"],
                rawText: "/paid ORD-PAID-1 -s",
                isGroup: false,
                isAdmin: true,
                userLang: "id",
                ctx: {
                    client: { markOrderAsPaid: markPaidMock } as any,
                    state: {} as any,
                    sendText: mock(async (_jid, text) => {
                        sentText = text;
                    }),
                    sendImage: mock(async () => {}),
                }
            };

            await paidCommand.execute(mockCtx);
            expect(markPaidMock).toHaveBeenCalledWith("ORD-PAID-1", { silent: true });
            expect(sentText).toContain("PEMBAYARAN DIVERIFIKASI MANUAL (SILENT)");
            expect(sentText).toContain("ORD-PAID-1");
        });

        it("should mark latest pending payment order as paid when no ID given", async () => {
            let sentText = "";
            const markPaidMock = mock(async (id: string, options?: { silent?: boolean }) => ({
                success: true,
                orderId: id,
                status: "QUEUED",
                gamertag: "Buyer1",
                itemName: "Ultimate Rank",
                totalNominal: 55000,
                silent: options?.silent ?? false,
            }));
            const listOrdersMock = mock(async () => ({
                count: 1,
                orders: [{ id: "ORD-PENDING-LATEST", status: "PENDING_PAYMENT" }]
            }));

            const mockCtx: CommandContext = {
                remoteJid: "admin@s.whatsapp.net",
                sender: "admin@s.whatsapp.net",
                args: [],
                rawText: "/paid",
                isGroup: false,
                isAdmin: true,
                userLang: "id",
                ctx: {
                    client: {
                        listOrders: listOrdersMock,
                        markOrderAsPaid: markPaidMock
                    } as any,
                    state: {} as any,
                    sendText: mock(async (_jid, text) => {
                        sentText = text;
                    }),
                    sendImage: mock(async () => {}),
                }
            };

            await paidCommand.execute(mockCtx);
            expect(markPaidMock).toHaveBeenCalledWith("ORD-PENDING-LATEST", { silent: false });
            expect(sentText).toContain("ORD-PENDING-LATEST");
        });

        it("should support /paid all -s", async () => {
            let sentText = "";
            const markAllMock = mock(async (options?: { silent?: boolean }) => ({
                success: true,
                count: 2,
                orderIds: ["ORD-1", "ORD-2"],
                silent: options?.silent ?? false,
            }));

            const mockCtx: CommandContext = {
                remoteJid: "admin@s.whatsapp.net",
                sender: "admin@s.whatsapp.net",
                args: ["all", "-s"],
                rawText: "/paid all -s",
                isGroup: false,
                isAdmin: true,
                userLang: "id",
                ctx: {
                    client: { markAllOrdersAsPaid: markAllMock } as any,
                    state: {} as any,
                    sendText: mock(async (_jid, text) => {
                        sentText = text;
                    }),
                    sendImage: mock(async () => {}),
                }
            };

            await paidCommand.execute(mockCtx);
            expect(markAllMock).toHaveBeenCalledWith({ silent: true });
            expect(sentText).toContain("2 PEMBAYARAN BERHASIL DIVERIFIKASI (SILENT)");
        });
    });

    describe("/reprocess command enhancements", () => {
        it("should reprocess single order silently with -s", async () => {
            let sentText = "";
            const retryOrderMock = mock(async (id: string, options?: { silent?: boolean }) => ({
                success: true,
                orderId: id,
                status: "QUEUED",
                silent: options?.silent ?? false,
            }));

            const mockCtx: CommandContext = {
                remoteJid: "admin@s.whatsapp.net",
                sender: "admin@s.whatsapp.net",
                args: ["ORD-RETRY-1", "-s"],
                rawText: "/reprocess ORD-RETRY-1 -s",
                isGroup: false,
                isAdmin: true,
                userLang: "id",
                ctx: {
                    client: { retryOrder: retryOrderMock } as any,
                    state: {} as any,
                    sendText: mock(async (_jid, text) => {
                        sentText = text;
                    }),
                    sendImage: mock(async () => {}),
                }
            };

            await reprocessCommand.execute(mockCtx);
            expect(retryOrderMock).toHaveBeenCalledWith("ORD-RETRY-1", { silent: true });
            expect(sentText).toContain("DIPROSES ULANG (SILENT)");
            expect(sentText).toContain("ORD-RETRY-1");
        });

        it("should reprocess all held orders with /reprocess all -s", async () => {
            let sentText = "";
            const retryAllMock = mock(async (options?: { silent?: boolean }) => ({
                success: true,
                count: 2,
                orderIds: ["ORD-A", "ORD-B"],
                silent: options?.silent ?? false,
            }));

            const mockCtx: CommandContext = {
                remoteJid: "admin@s.whatsapp.net",
                sender: "admin@s.whatsapp.net",
                args: ["all", "-s"],
                rawText: "/reprocess all -s",
                isGroup: false,
                isAdmin: true,
                userLang: "id",
                ctx: {
                    client: { retryAllOrders: retryAllMock } as any,
                    state: {} as any,
                    sendText: mock(async (_jid, text) => {
                        sentText = text;
                    }),
                    sendImage: mock(async () => {}),
                }
            };

            await reprocessCommand.execute(mockCtx);
            expect(retryAllMock).toHaveBeenCalledWith({ silent: true });
            expect(sentText).toContain("REPROCESS SELESAI (SILENT)");
            expect(sentText).toContain("2 pesanan");
        });
    });
});
