import type { CatalogItem } from "./types";
import type { Language } from "./i18n";

export type StepStatus =
    | "IDLE"
    | "AWAITING_CATEGORY"
    | "AWAITING_ITEM"
    | "AWAITING_GAMERTAG"
    | "AWAITING_CONFIRMATION"
    | "AWAITING_RETRY_GAMERTAG"
    | "AWAITING_RETRY_CONFIRMATION"
    | "AWAITING_SUPPORT_CONFIRMATION"
    | "LIVE_CHAT";

export interface AppliedVoucherInfo {
    code: string;
    discountNominal: number;
    finalPrice: number;
}

export interface RetryOrderInfo {
    orderId: string;
    itemName: string;
    oldGamertag: string;
    newGamertag?: string;
    attempts: number;
}

export interface UserSession {
    step: StepStatus;
    selectedCategory?: string;
    selectedItem?: CatalogItem;
    gamertag?: string;
    appliedVoucher?: AppliedVoucherInfo;
    lastQrKey?: any;
    activeOrderId?: string;
    language?: Language;
    lastUpdated: number;
    lastCancelledAt?: number;
    lastBackAt?: number;
    retryOrder?: RetryOrderInfo;
    lastFailedOrder?: {
        orderId: string;
        itemName: string;
        gamertag: string;
        attempts: number;
    };
    liveChatOrderId?: string;
    pendingSupportOrderId?: string;
}

export class StateManager {
    private readonly sessions = new Map<string, UserSession>();
    private readonly userLanguages = new Map<string, Language>();
    private readonly orderRetryAttempts = new Map<string, number>();
    private readonly ttlMs: number;

    constructor(ttlMs = 15 * 60 * 1000) {
        this.ttlMs = ttlMs;
    }

    /**
     * Gets user language preference, default 'id'.
     */
    getLanguage(jid: string): Language {
        return this.userLanguages.get(jid) || "id";
    }

    /**
     * Sets user language preference.
     */
    setLanguage(jid: string, lang: Language): void {
        this.userLanguages.set(jid, lang);
        const session = this.sessions.get(jid);
        if (session) {
            session.language = lang;
        }
    }

    /**
     * Gets or creates user session, resetting if timed out.
     */
    getSession(jid: string): UserSession {
        const existing = this.sessions.get(jid);
        if (!existing) {
            const fresh: UserSession = {
                step: "IDLE",
                language: this.getLanguage(jid),
                lastUpdated: Date.now()
            };
            this.sessions.set(jid, fresh);
            return fresh;
        }

        if (existing.step !== "LIVE_CHAT" && this.isExpired(existing)) {
            this.clear(jid);
            const fresh: UserSession = {
                step: "IDLE",
                language: this.getLanguage(jid),
                lastUpdated: Date.now()
            };
            this.sessions.set(jid, fresh);
            return fresh;
        }

        return existing;
    }

    /**
     * Initiates buying flow starting at category selection.
     */
    startBuyingFlow(jid: string): void {
        const existing = this.sessions.get(jid);
        this.sessions.set(jid, {
            step: "AWAITING_CATEGORY",
            language: this.getLanguage(jid),
            lastUpdated: Date.now(),
            lastBackAt: existing?.lastBackAt,
            lastCancelledAt: existing?.lastCancelledAt
        });
    }

    /**
     * Sets chosen category and advances to item selection.
     */
    setCategory(jid: string, category: string): void {
        const current = this.getSession(jid);
        current.step = "AWAITING_ITEM";
        current.selectedCategory = category;
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Sets chosen catalog item and advances to gamertag input.
     */
    setItem(jid: string, item: CatalogItem): void {
        const current = this.getSession(jid);
        current.step = "AWAITING_GAMERTAG";
        current.selectedItem = item;
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Sets target Minecraft gamertag.
     */
    setGamertag(jid: string, gamertag: string): void {
        const current = this.getSession(jid);
        current.step = "AWAITING_CONFIRMATION";
        current.gamertag = gamertag.trim();
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Sets applied voucher for the checkout session.
     */
    setAppliedVoucher(jid: string, voucher?: AppliedVoucherInfo): void {
        const current = this.getSession(jid);
        current.appliedVoucher = voucher;
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Clears applied voucher.
     */
    clearAppliedVoucher(jid: string): void {
        const current = this.sessions.get(jid);
        if (current) {
            current.appliedVoucher = undefined;
        }
    }

    /**
     * Stores last QR message key for automatic deletion on payment/expiry.
     */
    setQrMessageKey(jid: string, key: any): void {
        const current = this.getSession(jid);
        current.lastQrKey = key;
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Gets the last QR message key for a JID.
     */
    getQrMessageKey(jid: string): any {
        return this.sessions.get(jid)?.lastQrKey;
    }

    /**
     * Clears stored QR message key for a JID.
     */
    clearQrMessageKey(jid: string): void {
        const current = this.sessions.get(jid);
        if (current) {
            current.lastQrKey = undefined;
        }
    }

    /**
     * Sets the active pending order ID for a JID.
     */
    setActiveOrderId(jid: string, orderId: string): void {
        const current = this.getSession(jid);
        current.activeOrderId = orderId;
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Gets the active pending order ID for a JID.
     */
    getActiveOrderId(jid: string): string | undefined {
        return this.sessions.get(jid)?.activeOrderId;
    }

    /**
     * Clears active pending order ID for a JID.
     */
    clearActiveOrderId(jid: string): void {
        const current = this.sessions.get(jid);
        if (current) {
            current.activeOrderId = undefined;
        }
    }

    /**
     * Resets session to IDLE and tracks cancellation timestamp.
     */
    clear(jid: string): void {
        const lang = this.getLanguage(jid);
        this.sessions.set(jid, {
            step: "IDLE",
            language: lang,
            lastUpdated: Date.now(),
            lastCancelledAt: Date.now()
        });
    }

    /**
     * Gets timestamp of when session was last cancelled.
     */
    getLastCancelledAt(jid: string): number | undefined {
        return this.sessions.get(jid)?.lastCancelledAt;
    }

    /**
     * Sets timestamp of when user last cancelled or triggered cancel feedback.
     */
    setLastCancelledAt(jid: string): void {
        const session = this.getSession(jid);
        session.lastCancelledAt = Date.now();
    }

    /**
     * Sets timestamp of when user last navigated back.
     */
    setLastBackAt(jid: string): void {
        const session = this.getSession(jid);
        session.lastBackAt = Date.now();
    }

    /**
     * Gets timestamp of when user last navigated back.
     */
    getLastBackAt(jid: string): number | undefined {
        return this.sessions.get(jid)?.lastBackAt;
    }

    /**
     * Checks if session exceeded inactivity TTL.
     */
    isExpired(session: UserSession): boolean {
        return Date.now() - session.lastUpdated > this.ttlMs;
    }

    /**
     * Gets retry count for an order.
     */
    getOrderRetryAttempts(orderId: string): number {
        return this.orderRetryAttempts.get(orderId) || 0;
    }

    /**
     * Increments retry count for an order and returns new count.
     */
    incrementOrderRetryAttempts(orderId: string): number {
        const next = (this.orderRetryAttempts.get(orderId) || 0) + 1;
        this.orderRetryAttempts.set(orderId, next);
        return next;
    }

    /**
     * Sets user session into retry gamertag state.
     */
    setRetryOrder(jid: string, retry: RetryOrderInfo): void {
        const session = this.getSession(jid);
        session.step = "AWAITING_RETRY_GAMERTAG";
        session.retryOrder = retry;
        session.lastUpdated = Date.now();
    }

    /**
     * Gets active retry order info for user session.
     */
    getRetryOrder(jid: string): RetryOrderInfo | undefined {
        return this.sessions.get(jid)?.retryOrder;
    }

    /**
     * Clears active retry order state.
     */
    clearRetryOrder(jid: string): void {
        const session = this.sessions.get(jid);
        if (session) {
            session.retryOrder = undefined;
            if (session.step === "AWAITING_RETRY_GAMERTAG" || session.step === "AWAITING_RETRY_CONFIRMATION") {
                session.step = "IDLE";
            }
        }
    }

    /**
     * Sets last failed order information for /support fallback.
     */
    setLastFailedOrder(jid: string, info: { orderId: string; itemName: string; gamertag: string; attempts: number }): void {
        const session = this.getSession(jid);
        session.lastFailedOrder = info;
    }

    /**
     * Gets last failed order information for /support fallback.
     */
    getLastFailedOrder(jid: string): { orderId: string; itemName: string; gamertag: string; attempts: number } | undefined {
        return this.sessions.get(jid)?.lastFailedOrder;
    }

    /**
     * Puts user session into AWAITING_SUPPORT_CONFIRMATION to ask user consent before going live.
     */
    requestSupportConsent(jid: string, orderId?: string): void {
        const session = this.getSession(jid);
        session.step = "AWAITING_SUPPORT_CONFIRMATION";
        session.pendingSupportOrderId = orderId;
        session.lastUpdated = Date.now();
    }

    /**
     * Cancels pending support consent request.
     */
    cancelSupportConsent(jid: string): void {
        const session = this.sessions.get(jid);
        if (session && session.step === "AWAITING_SUPPORT_CONFIRMATION") {
            session.step = "IDLE";
            session.pendingSupportOrderId = undefined;
            session.lastUpdated = Date.now();
        }
    }

    /**
     * Puts user session into LIVE_CHAT mode.
     */
    startLiveChat(jid: string, orderId?: string): void {
        const session = this.getSession(jid);
        session.step = "LIVE_CHAT";
        session.liveChatOrderId = orderId || session.pendingSupportOrderId;
        session.pendingSupportOrderId = undefined;
        session.lastUpdated = Date.now();
    }

    /**
     * Ends LIVE_CHAT mode for user session.
     */
    endLiveChat(jid: string): void {
        const session = this.sessions.get(jid);
        if (session) {
            session.step = "IDLE";
            session.liveChatOrderId = undefined;
            session.lastUpdated = Date.now();
        }
    }

    /**
     * Checks if user session is currently in LIVE_CHAT mode.
     */
    isLiveChat(jid: string): boolean {
        return this.sessions.get(jid)?.step === "LIVE_CHAT";
    }

    /**
     * Finds active live chat session by order ID or phone number/JID.
     */
    findLiveChatUser(query?: string): { jid: string; session: UserSession } | undefined {
        const cleaned = query ? query.trim().toLowerCase().replace(/^#/, "") : "";
        for (const [jid, session] of this.sessions.entries()) {
            if (session.step === "LIVE_CHAT") {
                if (!cleaned) {
                    return { jid, session };
                }
                const phone = jid.replace(/[^0-9]/g, "");
                if (
                    session.liveChatOrderId?.toLowerCase() === cleaned ||
                    session.retryOrder?.orderId?.toLowerCase() === cleaned ||
                    session.lastFailedOrder?.orderId?.toLowerCase() === cleaned ||
                    jid.toLowerCase().includes(cleaned) ||
                    phone.includes(cleaned)
                ) {
                    return { jid, session };
                }
            }
        }
        return undefined;
    }

    /**
     * Gets all users currently in LIVE_CHAT mode.
     */
    getAllActiveLiveChats(): Array<{ jid: string; orderId?: string }> {
        const list: Array<{ jid: string; orderId?: string }> = [];
        for (const [jid, session] of this.sessions.entries()) {
            if (session.step === "LIVE_CHAT") {
                list.push({
                    jid,
                    orderId: session.liveChatOrderId || session.retryOrder?.orderId || session.lastFailedOrder?.orderId
                });
            }
        }
        return list;
    }
}
