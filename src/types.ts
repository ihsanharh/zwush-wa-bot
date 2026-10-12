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
    sku?: string;
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
    | "EXPIRED"
    | "CANCELLED";

export interface OrderStatusResponse {
    success: boolean;
    order: {
        id: string;
        gamertag: string;
        itemName: string;
        status: OrderStatus;
        totalNominal: number;
        platformUserId?: string;
        failureReason?: string | null;
        createdAt?: string;
    };
}

export type OrderInfo = OrderStatusResponse["order"];

export interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface UserOrdersResponse {
    success: boolean;
    orders: OrderStatusResponse["order"][];
    pagination?: PaginationInfo;
}

export interface OrderRetryResponse {
    success: boolean;
    orderId: string;
    status: OrderStatus;
}

export interface OrderNotificationPayload {
    orderId: string;
    platform: string;
    platformUserId: string;
    gamertag: string;
    itemName: string;
    status: OrderStatus;
    message?: string;
    timestamp?: number;
    silent?: boolean;
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
        costumeTokens?: number;
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

export interface OrderCheckPaymentResponse {
    success: boolean;
    verified?: boolean;
    alreadyProcessed?: boolean;
    code?: string;
    message?: string;
    remainingSeconds?: number;
    order?: OrderStatusResponse["order"];
    matchedTransaction?: {
        amount: number;
        txId: string;
        time?: string;
    };
}

export interface VoucherItem {
    id: string;
    code: string;
    discountType: "PERCENT" | "FLAT";
    discountValue: number;
    maxUses: number | null;
    usedCount: number;
    active: boolean;
    expiresAt: string | null;
    createdAt: string;
}

export interface CreateVoucherInput {
    code: string;
    discountType: "PERCENT" | "FLAT";
    discountValue: number;
    maxUses?: number | null;
    expiresAt?: string | null;
}

export interface UpdateVoucherInput {
    discountType?: "PERCENT" | "FLAT";
    discountValue?: number;
    maxUses?: number | null;
    active?: boolean;
    expiresAt?: string | null;
}

