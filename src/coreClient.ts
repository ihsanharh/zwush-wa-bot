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
    VoucherValidationResponse
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
    async getCatalog(): Promise<CatalogItem[]> {
        const res = await fetch(`${this.baseUrl}/api/catalog`);
        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Failed to fetch catalog: ${res.status} ${errBody}`);
        }
        const data = (await res.json()) as CatalogResponse;
        return data.items;
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
            })
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
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}`);
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
        const res = await fetch(`${this.baseUrl}/api/orders/user/${encodeURIComponent(platformUserId)}`);
        const data = (await res.json()) as UserOrdersResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to fetch orders for user (${res.status})`);
        }
        return data.orders;
    }

    /**
     * Retries a single order that is in INSUFFICIENT_TOKENS or FAILED status.
     */
    async retryOrder(orderId: string): Promise<OrderRetryResponse> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/retry`, {
            method: "POST"
        });
        const data = (await res.json()) as OrderRetryResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to retry order #${orderId} (${res.status})`);
        }
        return data;
    }

    /**
     * Retries all orders currently in INSUFFICIENT_TOKENS status.
     */
    async retryAllOrders(): Promise<OrderRetryAllResponse> {
        const res = await fetch(`${this.baseUrl}/api/orders/retry-all`, {
            method: "POST"
        });
        const data = (await res.json()) as OrderRetryAllResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Failed to retry all orders (${res.status})`);
        }
        return data;
    }

    /**
     * Fetches the dynamic QRIS PNG buffer directly from core service.
     */
    async getOrderQrPng(orderId: string): Promise<Buffer> {
        const res = await fetch(`${this.baseUrl}/api/orders/${encodeURIComponent(orderId)}/qr.png`);
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
        const res = await fetch(`${this.baseUrl}/api/vouchers/status`);
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
            body: JSON.stringify({ percent })
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
            body: JSON.stringify(payload)
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
            }
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
            body: JSON.stringify({ code, itemName })
        });
        const data = (await res.json()) as VoucherValidationResponse & { message?: string };
        if (!res.ok || !data.success) {
            throw new Error(data.message || `Voucher '${code}' tidak valid`);
        }
        return data;
    }
}
