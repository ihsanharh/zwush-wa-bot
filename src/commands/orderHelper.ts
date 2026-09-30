import type { OrderStatus } from "../types";

export interface OrderCommandArgs {
    isAll: boolean;
    isSilent: boolean;
    orderId: string | null;
    rawTokens: string[];
}

const SILENT_TOKENS = new Set(["-s", "--silent", "silent", "senyap"]);
const ALL_TOKENS = new Set(["all", "semua"]);

/**
 * Normalizes an order ID string (e.g. "123456", "#ORD-123456", "ord-123456" -> "ORD-123456").
 */
export function normalizeOrderId(raw: string): string {
    let clean = (raw || "").trim().toUpperCase().replace(/^#/, "");
    if (!clean.startsWith("ORD-")) {
        clean = "ORD-" + clean;
    }
    return clean;
}

/**
 * Parses arguments for order-related commands (/done, /paid, /reprocess, /status).
 * Supports flags: -s, --silent, silent
 * Supports keywords: all, semua
 * Supports order ID in any position (e.g. "/done ORD-1 -s", "/done -s ORD-1", "/done -s")
 */
export function parseOrderArgs(args: string[]): OrderCommandArgs {
    let isAll = false;
    let isSilent = false;
    let orderId: string | null = null;
    const rawTokens: string[] = [];

    for (const token of args) {
        const trimmed = token.trim();
        if (!trimmed) continue;
        const lower = trimmed.toLowerCase();

        if (SILENT_TOKENS.has(lower)) {
            isSilent = true;
        } else if (ALL_TOKENS.has(lower)) {
            isAll = true;
        } else {
            rawTokens.push(trimmed);
            if (!orderId) {
                orderId = normalizeOrderId(trimmed);
            }
        }
    }

    return {
        isAll,
        isSilent,
        orderId,
        rawTokens
    };
}

export interface ResolveTargetOptions {
    preferredStatuses?: OrderStatus[];
    fallbackToLatest?: boolean;
}

/**
 * Resolves the target order ID:
 * 1. If explicit orderId provided in args, uses that.
 * 2. If no orderId provided and not "all", queries latest orders from CoreClient.
 *    Prefers orders matching preferredStatuses, otherwise falls back to the most recent order.
 * 3. Returns null if no orders found or target is "all".
 */
export async function resolveTargetOrderId(
    client: any,
    parsed: OrderCommandArgs,
    options: ResolveTargetOptions = { fallbackToLatest: true }
): Promise<{ orderId: string; order?: any } | null> {
    if (parsed.orderId) {
        return { orderId: parsed.orderId };
    }

    if (parsed.isAll) {
        return null;
    }

    if (!client || typeof client.listOrders !== "function") {
        return null;
    }

    try {
        const res = await client.listOrders(undefined, 10);
        const orders = res?.orders;
        if (!Array.isArray(orders) || orders.length === 0) {
            return null;
        }

        if (options.preferredStatuses && options.preferredStatuses.length > 0) {
            const matched = orders.find((o: any) => options.preferredStatuses!.includes(o.status));
            if (matched) {
                return { orderId: matched.id, order: matched };
            }
        }

        if (options.fallbackToLatest !== false) {
            return { orderId: orders[0].id, order: orders[0] };
        }
    } catch (err: unknown) {
        console.warn("[orderHelper] Failed to query latest orders:", err instanceof Error ? err.message : err);
    }

    return null;
}
