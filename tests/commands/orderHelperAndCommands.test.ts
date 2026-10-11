import { describe, expect, it, mock } from "bun:test";
import { normalizeOrderId, parseOrderArgs, resolveTargetOrderId } from "../../src/commands/orderHelper";

describe("Order Helper Utilities", () => {
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
});
