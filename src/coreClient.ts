import type {
    CatalogItem,
    CatalogResponse,
    OrderCreateResponse,
    OrderStatusResponse,
    UserOrdersResponse,
    PaginationInfo,
    OrderRetryResponse,
    VoucherValidationResponse,
    BotBalanceResponse,
    OrderCheckPaymentResponse,
    VoucherItem,
    CreateVoucherInput,
    UpdateVoucherInput
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
     * Fetches recent orders for a platform user, supporting optional server-side pagination.
     */
    async getUserOrders(
        platformUserId: string,
        options?: { page?: number; limit?: number } | number
    ): Promise<OrderStatusResponse["order"][] & { pagination?: PaginationInfo }> {
        const url = new URL(`${this.baseUrl}/api/orders/user/${encodeURIComponent(platformUserId)}`);
        if (typeof options === "number") {
            url.searchParams.set("limit", options.toString());
        } else if (options) {
            if (options.page !== undefined) {
                url.searchParams.set("page", options.page.toString());
            }
            if (options.limit !== undefined) {
                url.searchParams.set("limit", options.limit.toString());
            }
        }
        const res = await fetch(url.toString(), {
            signal: AbortSignal.timeout(10000)
        });
        const data = (await res.json()) as UserOrdersResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to fetch orders for user (${res.status})`);
        }
        const orders = (data.orders || []) as OrderStatusResponse["order"][] & { pagination?: PaginationInfo };
        if (data.pagination) {
            orders.pagination = data.pagination;
        }
        return orders;
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
     * Cancels a pending order, releasing unique code and reverting voucher quota.
     */
    async cancelOrder(orderId: string, reason = "Cancelled by user", options?: { silent?: boolean }): Promise<{
        success: boolean;
        orderId: string;
        status: string;
        gamertag?: string;
        itemName?: string;
        totalNominal?: number;
        silent?: boolean;
        message?: string;
    }> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason, silent: options?.silent ?? false }),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as {
            success: boolean;
            orderId: string;
            status: string;
            gamertag?: string;
            itemName?: string;
            totalNominal?: number;
            silent?: boolean;
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
     * Lists all vouchers (active and inactive) from core service.
     */
    async listVouchers(): Promise<VoucherItem[]> {
        const res = await fetch(`${this.baseUrl}/api/vouchers`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Secret": config.WEBHOOK_SECRET
            },
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as { success: boolean; vouchers: VoucherItem[]; message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to fetch vouchers (${res.status})`);
        }
        return data.vouchers;
    }

    /**
     * Creates a new voucher in core service.
     */
    async createVoucher(payload: CreateVoucherInput): Promise<VoucherItem> {
        const res = await fetch(`${this.baseUrl}/api/vouchers`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Secret": config.WEBHOOK_SECRET
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as { success: boolean; voucher: VoucherItem; message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to create voucher (${res.status})`);
        }
        return data.voucher;
    }

    /**
     * Updates an existing voucher in core service.
     */
    async updateVoucher(code: string, payload: UpdateVoucherInput): Promise<VoucherItem> {
        const res = await fetch(`${this.baseUrl}/api/vouchers/${encodeURIComponent(code)}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Secret": config.WEBHOOK_SECRET
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as { success: boolean; voucher: VoucherItem; message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to update voucher '${code}' (${res.status})`);
        }
        return data.voucher;
    }

    /**
     * Permanently deletes a voucher from core service database.
     */
    async deleteVoucher(code: string): Promise<boolean> {
        const res = await fetch(`${this.baseUrl}/api/vouchers/${encodeURIComponent(code)}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Secret": config.WEBHOOK_SECRET
            },
            signal: AbortSignal.timeout(15000)
        });
        const data = (await res.json()) as { success: boolean; message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to delete voucher '${code}' (${res.status})`);
        }
        return true;
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
     * Checks if a pending order has been paid by querying the core GoBiz payment verifier.
     */
    async checkOrderPayment(orderId: string): Promise<OrderCheckPaymentResponse> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/check-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(15000),
        });
        const data = (await res.json()) as OrderCheckPaymentResponse;
        return data;
    }

    /**
     * Aliases for order operations
     */
    async markOrderPaid(orderId: string, options?: { silent?: boolean }) {
        return this.markOrderAsPaid(orderId, options);
    }

    async reprocessOrder(orderId: string, options?: { silent?: boolean }) {
        return this.retryOrder(orderId, options);
    }

    async updateOrderStatus(orderId: string, status: string) {
        if (status === "COMPLETED" || status === "SUCCESS") {
            return this.manualCompleteOrder(orderId);
        }
        if (status === "CANCELLED" || status === "REFUNDED") {
            return this.cancelOrder(orderId, `Status updated to ${status}`);
        }
        throw new Error(`Unsupported status update: ${status}`);
    }
}
