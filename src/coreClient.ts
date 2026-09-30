import type {
    CatalogItem,
    CatalogResponse,
    OrderCreateResponse,
    OrderStatusResponse,
    UserOrdersResponse,
    OrderRetryResponse,
    OrderRetryAllResponse,
    VoucherItem,
    VoucherStatusResponse,
    VoucherValidationResponse,
    BotBalanceResponse
} from "./types";
import { config } from "./config";

export class CoreClient {
    private readonly baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }

    /**
     * Fetches the active catalog from the core service.
     */
    async getCatalog(retries = 3): Promise<CatalogItem[]> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const res = await fetch(`${this.baseUrl}/api/catalog`, {
                    signal: AbortSignal.timeout(10000)
                });
                if (!res.ok) {
                    const errBody = await res.text();
                    throw new Error(`Failed to fetch catalog: ${res.status} ${errBody}`);
                }
                const data = (await res.json()) as CatalogResponse;
                return data.items;
            } catch (err) {
                if (attempt === retries) throw err;
                console.warn(`[CoreClient] getCatalog attempt ${attempt} failed, retrying in 1.5s...`);
                await new Promise((r) => setTimeout(r, 1500));
            }
        }
        return [];
    }

    /**
     * Creates an order with unique nominal code in core service.
     */
    async createOrder(
        gamertag: string,
        itemName: string,
        platformUserId: string,
        voucherCode?: string
    ): Promise<OrderCreateResponse> {
        const res = await fetch(`${this.baseUrl}/api/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                platform: "whatsapp",
                platformUserId,
                gamertag,
                itemName,
                voucherCode: voucherCode || undefined
            }),
            signal: AbortSignal.timeout(15000)
        });

        const data = (await res.json()) as { success: boolean; message?: string } & OrderCreateResponse;
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to create order (${res.status})`);
        }

        return data;
    }

    /**
     * Checks order status by ID.
     */
    async getOrderStatus(orderId: string): Promise<OrderStatusResponse["order"]> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}`, {
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as OrderStatusResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Order #${orderId} not found`);
        }
        return data.order;
    }

    /**
     * Fetches recent orders for a platform user.
     */
    async getUserOrders(platformUserId: string): Promise<OrderStatusResponse["order"][]> {
        const res = await fetch(`${this.baseUrl}/api/orders/user/${encodeURIComponent(platformUserId)}`, {
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as UserOrdersResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to fetch orders for user (${res.status})`);
        }
        return data.orders;
    }

    /**
     * Retries a single order that is in INSUFFICIENT_TOKENS or FAILED status.
     */
    async retryOrder(orderId: string, options?: { silent?: boolean }): Promise<OrderRetryResponse & { silent?: boolean }> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/retry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ silent: options?.silent ?? false }),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as OrderRetryResponse & { message?: string; silent?: boolean };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to retry order #${orderId} (${res.status})`);
        }
        return data;
    }

    /**
     * Manually marks an order as paid, bypassing the GoPay webhook.
     */
    async markOrderAsPaid(orderId: string, options?: { silent?: boolean }): Promise<{
        success: boolean;
        orderId: string;
        status: string;
        gamertag: string;
        itemName: string;
        totalNominal: number;
        silent?: boolean;
        message?: string;
    }> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/paid`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ silent: options?.silent ?? false }),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as {
            success: boolean;
            orderId: string;
            status: string;
            gamertag: string;
            itemName: string;
            totalNominal: number;
            silent?: boolean;
            message?: string;
        };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to mark order #${orderId} as paid (${res.status})`);
        }
        return data;
    }

    /**
     * Manually marks all pending payment orders as paid.
     */
    async markAllOrdersAsPaid(options?: { silent?: boolean }): Promise<{
        success: boolean;
        count: number;
        orderIds: string[];
        silent?: boolean;
        message?: string;
    }> {
        const res = await fetch(`${this.baseUrl}/api/orders/paid-all`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ silent: options?.silent ?? false }),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as any;
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to mark all orders as paid (${res.status})`);
        }
        return data;
    }

    /**
     * Cancels a pending order, releasing unique code and reverting voucher quota.
     */
    async cancelOrder(orderId: string, reason = "Cancelled by user"): Promise<{
        success: boolean;
        orderId: string;
        status: string;
        gamertag?: string;
        itemName?: string;
        totalNominal?: number;
        message?: string;
    }> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason }),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as {
            success: boolean;
            orderId: string;
            status: string;
            gamertag?: string;
            itemName?: string;
            totalNominal?: number;
            message?: string;
        };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to cancel order #${orderId} (${res.status})`);
        }
        return data;
    }

    /**
     * Updates an order's gamertag and re-enqueues it for gifting.
     */
    async updateOrderGamertag(orderId: string, gamertag: string): Promise<OrderRetryResponse> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/update-gamertag`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gamertag }),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as OrderRetryResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to update gamertag for order #${orderId} (${res.status})`);
        }
        return data;
    }

    /**
     * Retries all orders currently in INSUFFICIENT_TOKENS status.
     */
    async retryAllOrders(options?: { silent?: boolean }): Promise<OrderRetryAllResponse & { silent?: boolean }> {
        const res = await fetch(`${this.baseUrl}/api/orders/retry-all`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ silent: options?.silent ?? false }),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as OrderRetryAllResponse & { message?: string; silent?: boolean };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to retry all orders (${res.status})`);
        }
        return data;
    }

    /**
     * Fetches the dynamic QRIS PNG buffer directly from core service.
     */
    async getOrderQrPng(orderId: string): Promise<Buffer> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/qr.png`, {
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch QRIS PNG for order #${orderId} (${res.status})`);
        }
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Gets store discount status and active vouchers.
     */
    async getVoucherStatus(): Promise<VoucherStatusResponse> {
        const res = await fetch(`${this.baseUrl}/api/vouchers/status`, {
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as VoucherStatusResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to fetch voucher status (${res.status})`);
        }
        return data;
    }

    /**
     * Sets the global store discount percentage.
     */
    async setStoreDiscount(percent: number): Promise<number> {
        const res = await fetch(`${this.baseUrl}/api/vouchers/discount`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Secret": config.WEBHOOK_SECRET
            },
            body: JSON.stringify({ percent }),
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as { success: boolean; discountPercent: number; message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to update store discount (${res.status})`);
        }
        return data.discountPercent;
    }

    /**
     * Creates a new voucher code.
     */
    async createVoucher(payload: {
        code: string;
        discountType: "PERCENT" | "FLAT";
        discountValue: number;
        maxUses?: number | null;
        expiresAt?: string | null;
    }): Promise<VoucherItem> {
        const res = await fetch(`${this.baseUrl}/api/vouchers`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Secret": config.WEBHOOK_SECRET
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as { success: boolean; voucher: VoucherItem; message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to create voucher (${res.status})`);
        }
        return data.voucher;
    }

    /**
     * Deactivates a voucher code.
     */
    async deleteVoucher(code: string): Promise<void> {
        const res = await fetch(`${this.baseUrl}/api/vouchers/${encodeURIComponent(code)}`, {
            method: "DELETE",
            headers: {
                "X-Webhook-Secret": config.WEBHOOK_SECRET
            },
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as { success: boolean; message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to delete voucher (${res.status})`);
        }
    }

    /**
     * Validates a voucher code against an item name.
     */
    async validateVoucher(code: string, itemName: string): Promise<VoucherValidationResponse> {
        const res = await fetch(`${this.baseUrl}/api/vouchers/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, itemName }),
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as VoucherValidationResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Voucher '${code}' tidak valid`);
        }
        return data;
    }

    /**
     * Gets The Hive bot token balance and daily sales summary.
     */
    async getBalance(forceRefresh = false): Promise<BotBalanceResponse> {
        const url = `${this.baseUrl}/api/bot/balance${forceRefresh ? "?refresh=true" : ""}`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(forceRefresh ? 90000 : 15000)
        });
        const data = (await res.json()) as BotBalanceResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to fetch bot balance (${res.status})`);
        }
        return data;
    }

    /**
     * Triggers catalog synchronization from The Hive via gibot in core service.
     */
    async syncCatalog(): Promise<{ success: boolean; message: string; inProgress?: boolean }> {
        const res = await fetch(`${this.baseUrl}/api/catalog/sync`, {
            method: "GET",
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as any;
        if (!res.ok || !data.success) {
            throw new Error(data.error || data.message || `Gagal sinkronisasi katalog (${res.status})`);
        }
        return data;
    }

    /**
     * Marks an order as manually completed (SUCCESS) without triggering gibot.
     */
    async manualCompleteOrder(orderId: string, options?: { silent?: boolean }): Promise<{
        success: boolean;
        orderId: string;
        status: string;
        gamertag: string;
        itemName: string;
        totalNominal: number;
        silent?: boolean;
        message?: string;
    }> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/manual-complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ silent: options?.silent ?? false }),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as any;
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to complete order #${orderId} (${res.status})`);
        }
        return data;
    }

    /**
     * Marks all uncompleted orders as manually completed (SUCCESS).
     */
    async manualCompleteAllOrders(options?: { silent?: boolean }): Promise<{
        success: boolean;
        count: number;
        orderIds: string[];
        silent?: boolean;
        message?: string;
    }> {
        const res = await fetch(`${this.baseUrl}/api/orders/manual-complete-all`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ silent: options?.silent ?? false }),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as any;
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to complete all orders (${res.status})`);
        }
        return data;
    }

    /**
     * Lists recent orders from the core service, optionally filtered by status.
     */
    async listOrders(status?: string, limit = 10): Promise<{
        count: number;
        orders: OrderStatusResponse["order"][];
    }> {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        params.set("limit", String(limit));
        const res = await fetch(`${this.baseUrl}/api/orders?${params.toString()}`, {
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as any;
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to list orders (${res.status})`);
        }
        return {
            count: data.count,
            orders: data.orders
        };
    }
}
