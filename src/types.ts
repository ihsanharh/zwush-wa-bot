export interface CatalogItem {
    id: string;
    name: string;
    category: string;
    tokenCost: number;
    minecoins: number;
    originalPrice: number;
    rupiahPrice: number;
    discountPercent: number;
    imageUrl?: string | null;
    active: boolean;
}

export interface CatalogResponse {
    success: boolean;
    items: CatalogItem[];
    count: number;
}

export interface OrderCreateResponse {
    success: boolean;
    orderId: string;
    totalNominal: number;
    qrisString: string;
    expiresAt: string;
}

export type OrderStatus =
    | "PENDING_PAYMENT"
    | "QUEUED"
    | "GIFTING"
    | "SUCCESS"
    | "INSUFFICIENT_TOKENS"
    | "FAILED"
    | "EXPIRED";

export interface OrderStatusResponse {
    success: boolean;
    order: {
        id: string;
        gamertag: string;
        itemName: string;
        status: OrderStatus;
        totalNominal: number;
        failureReason?: string | null;
    };
}

export interface UserOrdersResponse {
    success: boolean;
    orders: OrderStatusResponse["order"][];
}

export interface OrderRetryResponse {
    success: boolean;
    orderId: string;
    status: OrderStatus;
}

export interface OrderRetryAllResponse {
    success: boolean;
    count: number;
    orderIds: string[];
}

export interface OrderNotificationPayload {
    orderId: string;
    platform: string;
    platformUserId: string;
    gamertag: string;
    itemName: string;
    status: OrderStatus;
    message?: string;
}

export interface VoucherItem {
    id: string;
    code: string;
    discountType: "PERCENT" | "FLAT";
    discountValue: number;
    maxUses?: number | null;
    usedCount: number;
    active: boolean;
    expiresAt?: string | null;
    createdAt: string;
}

export interface VoucherStatusResponse {
    success: boolean;
    discountPercent: number;
    vouchers: VoucherItem[];
}

export interface VoucherValidationResponse {
    success: boolean;
    valid: boolean;
    code: string;
    discountType: "PERCENT" | "FLAT";
    discountValue: number;
    discountNominal: number;
    originalPrice: number;
    storePrice: number;
    finalPrice: number;
}

export interface BotBalanceResponse {
    success: boolean;
    bot: {
        gamertag: string;
        tokens: number;
        status: string;
    };
    summary: {
        todayOrders: number;
        todayCompleted: number;
        todayRevenue: number;
        pendingPayment: number;
        giftingQueue: number;
        insufficientTokens: number;
        discountPercent: number;
        activeVouchers: number;
    };
}
