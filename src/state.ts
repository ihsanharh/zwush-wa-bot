import fs from "node:fs";
import path from "node:path";
import type { CatalogItem } from "./types";
import type { Language } from "./i18n";
import { config } from "./config";

export type StepStatus =
    | "IDLE"
    | "AWAITING_CATEGORY"
    | "AWAITING_ITEM"
    | "AWAITING_GAMERTAG"
    | "AWAITING_CONFIRMATION"
    | "AWAITING_VOUCHER_CODE"
    | "AWAITING_RETRY_GAMERTAG"
    | "AWAITING_RETRY_CONFIRMATION"
    | "AWAITING_SUPPORT_CONFIRMATION"
    | "LIVE_CHAT"
    | "ADMIN_AWAITING_VOUCHER_CODE"
    | "ADMIN_AWAITING_VOUCHER_TYPE"
    | "ADMIN_AWAITING_VOUCHER_VALUE"
    | "ADMIN_AWAITING_VOUCHER_MAX_USES"
    | "ADMIN_AWAITING_VOUCHER_ACTION_CODE"
    | "ADMIN_AWAITING_VOUCHER_EDIT_DISCOUNT"
    | "ADMIN_AWAITING_VOUCHER_EDIT_MAX_USES"
    | "AWAITING_DEFAULT_GAMERTAG";

export interface AppliedVoucherInfo {
    code: string;
    discountNominal: number;
    finalPrice: number;
}

export interface AdminVoucherDraft {
    code?: string;
    discountType?: "PERCENT" | "FLAT";
    discountValue?: number;
    maxUses?: number | null;
    targetCode?: string;
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
    catalogPage?: number;
    gamertag?: string;
    appliedVoucher?: AppliedVoucherInfo;
    appliedVoucherCode?: string;
    adminVoucherDraft?: AdminVoucherDraft;
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
    lastGreetingAt?: number;
    promptMessageId?: string;
    promptMessageIds?: string[];
}

export class StateManager {
    private readonly sessions = new Map<string, UserSession>();
    private readonly userLanguages = new Map<string, Language>();
    private readonly defaultGamertags = new Map<string, string>();
    private readonly syncedUsers = new Set<string>();
    private readonly orderRetryAttempts = new Map<string, number>();
    private readonly ttlMs: number;
    private readonly stateFilePath: string;
    private readonly userPreferencesFilePath: string;
    private maintenanceMode: boolean;

    constructor(ttlMs = 5 * 60 * 1000, stateFilePath?: string, userPreferencesFilePath?: string) {
        this.ttlMs = ttlMs;
        const authDir = path.dirname(config.AUTH_PATH || "./.auth/state.sqlite");
        this.stateFilePath = stateFilePath || path.join(authDir, "maintenance_state.json");
        this.userPreferencesFilePath = userPreferencesFilePath !== undefined
            ? userPreferencesFilePath
            : (process.env.NODE_ENV === "test" ? "" : path.join(authDir, "user_preferences.json"));
        this.maintenanceMode = this.loadPersistedMaintenanceMode();
        this.loadPersistedUserPreferences();
    }

    private loadPersistedMaintenanceMode(): boolean {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const raw = fs.readFileSync(this.stateFilePath, "utf-8");
                const data = JSON.parse(raw);
                if (typeof data.maintenance === "boolean") {
                    return data.maintenance;
                }
            }
        } catch (err) {
            console.warn("[StateManager] Failed to read persisted maintenance state:", err);
        }
        return config.MAINTENANCE_MODE;
    }

    private persistMaintenanceMode(enabled: boolean): void {
        try {
            const dir = path.dirname(this.stateFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(
                this.stateFilePath,
                JSON.stringify({ maintenance: enabled, updatedAt: new Date().toISOString() }, null, 2),
                "utf-8"
            );
        } catch (err) {
            console.warn("[StateManager] Failed to persist maintenance state:", err);
        }
    }

    /**
     * Checks whether maintenance mode is enabled.
     */
    isMaintenanceMode(): boolean {
        return this.maintenanceMode;
    }

    /**
     * Toggles maintenance mode and persists setting across restarts.
     */
    setMaintenanceMode(enabled: boolean): void {
        this.maintenanceMode = enabled;
        this.persistMaintenanceMode(enabled);
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
        this.persistUserPreferences();
    }

    private loadPersistedUserPreferences(): void {
        try {
            if (!this.userPreferencesFilePath || !fs.existsSync(this.userPreferencesFilePath)) {
                return;
            }
            const raw = fs.readFileSync(this.userPreferencesFilePath, "utf-8");
                const data = JSON.parse(raw);
                if (data.languages && typeof data.languages === "object") {
                    for (const [jid, lang] of Object.entries(data.languages)) {
                        if (lang === "id" || lang === "en") {
                            this.userLanguages.set(jid, lang);
                        }
                    }
                }
                if (data.defaultGamertags && typeof data.defaultGamertags === "object") {
                    for (const [jid, gt] of Object.entries(data.defaultGamertags)) {
                        if (typeof gt === "string" && gt.trim().length > 0) {
                            this.defaultGamertags.set(jid, gt.trim());
                        }
                    }
                }
        } catch (err) {
            console.warn("[StateManager] Failed to read persisted user preferences:", err);
        }
    }

    private persistUserPreferences(): void {
        try {
            if (!this.userPreferencesFilePath) {
                return;
            }
            const dir = path.dirname(this.userPreferencesFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const languagesObj: Record<string, string> = {};
            for (const [jid, lang] of this.userLanguages.entries()) {
                languagesObj[jid] = lang;
            }
            const defaultGamertagsObj: Record<string, string> = {};
            for (const [jid, gt] of this.defaultGamertags.entries()) {
                defaultGamertagsObj[jid] = gt;
            }
            fs.writeFileSync(
                this.userPreferencesFilePath,
                JSON.stringify({ languages: languagesObj, defaultGamertags: defaultGamertagsObj, updatedAt: new Date().toISOString() }, null, 2),
                "utf-8"
            );
        } catch (err) {
            console.warn("[StateManager] Failed to persist user preferences:", err);
        }
    }

    /**
     * Gets default Gamertag for a user JID if configured.
     */
    getDefaultGamertag(jid: string): string | undefined {
        return this.defaultGamertags.get(jid);
    }

    /**
     * Sets or updates default Gamertag for a user JID.
     */
    setDefaultGamertag(jid: string, gamertag?: string): void {
        if (gamertag && gamertag.trim().length > 0) {
            this.defaultGamertags.set(jid, gamertag.trim());
        } else {
            this.defaultGamertags.delete(jid);
        }
        this.persistUserPreferences();
    }

    /**
     * Removes configured default Gamertag for a user JID.
     */
    removeDefaultGamertag(jid: string): void {
        this.defaultGamertags.delete(jid);
        this.persistUserPreferences();
    }

    /**
     * Checks if user profile has been fetched/synced from zwush-core.
     */
    isUserSynced(jid: string): boolean {
        return this.syncedUsers.has(jid);
    }

    /**
     * Marks user as synced in memory.
     */
    markUserSynced(jid: string): void {
        this.syncedUsers.add(jid);
    }

    /**
     * Synchronizes user preferences from core service into StateManager.
     */
    syncUserProfile(jid: string, profile: { gamertag?: string | null; language?: Language }): void {
        this.syncedUsers.add(jid);
        if (profile.language) {
            this.userLanguages.set(jid, profile.language);
            const session = this.sessions.get(jid);
            if (session) {
                session.language = profile.language;
            }
        }
        if (profile.gamertag) {
            this.defaultGamertags.set(jid, profile.gamertag);
        } else if (profile.gamertag === null) {
            this.defaultGamertags.delete(jid);
        }
        this.persistUserPreferences();
    }

    /**
     * Returns a snapshot of all user preferences currently cached.
     */
    getAllPreferences(): { languages: Record<string, string>; defaultGamertags: Record<string, string> } {
        const languages: Record<string, string> = {};
        for (const [jid, lang] of this.userLanguages.entries()) {
            languages[jid] = lang;
        }
        const defaultGamertags: Record<string, string> = {};
        for (const [jid, gt] of this.defaultGamertags.entries()) {
            defaultGamertags[jid] = gt;
        }
        return { languages, defaultGamertags };
    }


    /**
     * Gets or creates user session, resetting if timed out.
     */
    getSession(jid: string): UserSession {
        if (this.sessions.size > 500) {
            this.cleanupExpiredSessions();
        }

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
     * Purges expired sessions and trims stale retry counters to prevent unbounded memory growth.
     */
    cleanupExpiredSessions(): void {
        const now = Date.now();
        for (const [jid, session] of this.sessions.entries()) {
            if (session.step !== "LIVE_CHAT" && now - session.lastUpdated > this.ttlMs * 2) {
                this.sessions.delete(jid);
            }
        }
        if (this.orderRetryAttempts.size > 2000) {
            this.orderRetryAttempts.clear();
        }
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
        current.catalogPage = 1;
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Sets current catalog page number.
     */
    setCatalogPage(jid: string, page: number): void {
        const current = this.getSession(jid);
        current.catalogPage = page;
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Gets current catalog page number, defaulting to 1.
     */
    getCatalogPage(jid: string): number {
        return this.sessions.get(jid)?.catalogPage ?? 1;
    }

    /**
     * Sets chosen catalog item and advances to gamertag input.
     */
    setItem(jid: string, item: CatalogItem): void {
        const current = this.getSession(jid);
        current.step = current.gamertag ? "AWAITING_CONFIRMATION" : "AWAITING_GAMERTAG";
        current.selectedItem = item;
        if (item.category) {
            current.selectedCategory = item.category;
        }
        current.promptMessageId = undefined;
        current.promptMessageIds = [];
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
        current.promptMessageId = undefined;
        current.promptMessageIds = [];
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Sets session to AWAITING_VOUCHER_CODE state.
     */
    setAwaitingVoucher(jid: string): void {
        const current = this.getSession(jid);
        current.step = "AWAITING_VOUCHER_CODE";
        current.promptMessageId = undefined;
        current.promptMessageIds = [];
        current.lastUpdated = Date.now();
        this.sessions.set(jid, current);
    }

    /**
     * Sets applied voucher for the checkout session.
     */
    setAppliedVoucher(jid: string, voucher?: AppliedVoucherInfo): void {
        const current = this.getSession(jid);
        current.appliedVoucher = voucher;
        current.appliedVoucherCode = voucher ? voucher.code : undefined;
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
            current.appliedVoucherCode = undefined;
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
            current.promptMessageId = undefined;
            current.promptMessageIds = [];
        }
    }

    /**
     * Resets session to IDLE and tracks cancellation timestamp.
     */
    clear(jid: string): void {
        const lang = this.getLanguage(jid);
        const existing = this.sessions.get(jid);
        this.sessions.set(jid, {
            step: "IDLE",
            language: lang,
            lastUpdated: Date.now(),
            lastCancelledAt: Date.now(),
            lastGreetingAt: existing?.lastGreetingAt,
            promptMessageIds: []
        });
    }

    /**
     * Gets timestamp of when greeting was last sent to user.
     */
    getLastGreetingAt(jid: string): number | undefined {
        return this.sessions.get(jid)?.lastGreetingAt;
    }

    /**
     * Sets timestamp of when greeting was last sent to user.
     */
    setLastGreetingAt(jid: string, timestamp: number = Date.now()): void {
        const session = this.getSession(jid);
        session.lastGreetingAt = timestamp;
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
     * Sets the primary message ID for the active flow, clearing previous sub-prompt IDs.
     */
    setPromptMessageId(jid: string, messageId?: string): void {
        const session = this.getSession(jid);
        session.promptMessageId = messageId;
        session.promptMessageIds = messageId ? [messageId] : [];
        session.lastUpdated = Date.now();
    }

    /**
     * Adds an auxiliary prompt message ID (e.g. modify drawer menu) while keeping existing prompts valid.
     */
    addPromptMessageId(jid: string, messageId: string): void {
        const session = this.getSession(jid);
        session.promptMessageId = messageId;
        if (!session.promptMessageIds) {
            session.promptMessageIds = [];
        }
        if (!session.promptMessageIds.includes(messageId)) {
            session.promptMessageIds.push(messageId);
        }
        if (session.promptMessageIds.length > 5) {
            session.promptMessageIds = session.promptMessageIds.slice(-5);
        }
        session.lastUpdated = Date.now();
    }

    /**
     * Checks if a quoted message ID matches any active prompt message for the user's current step.
     */
    isPromptMessageValid(jid: string, quotedMessageId: string): boolean {
        const session = this.sessions.get(jid);
        if (!session) return false;
        if (session.promptMessageIds && session.promptMessageIds.length > 0) {
            return session.promptMessageIds.includes(quotedMessageId);
        }
        return session.promptMessageId === quotedMessageId;
    }

    /**
     * Gets the latest prompt message ID for the active flow.
     */
    getPromptMessageId(jid: string): string | undefined {
        return this.sessions.get(jid)?.promptMessageId;
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
            session.activeOrderId = undefined;
            session.pendingSupportOrderId = undefined;
            session.retryOrder = undefined;
            session.lastFailedOrder = undefined;
            session.lastUpdated = Date.now();
        }
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

    private adminVoucherSessions = new Map<string, { step: StepStatus; draft: AdminVoucherDraft; lastUpdated: number }>();

    /**
     * Updates admin interactive voucher step and persists draft properties in isolated admin storage.
     */
    setAdminVoucherStep(jid: string, step: StepStatus, draft?: Partial<AdminVoucherDraft>): void {
        const existing = this.adminVoucherSessions.get(jid);
        const nextDraft: AdminVoucherDraft = {
            ...(existing?.draft || {}),
            ...(draft || {})
        };
        this.adminVoucherSessions.set(jid, {
            step,
            draft: nextDraft,
            lastUpdated: Date.now()
        });
    }

    /**
     * Gets the active admin voucher step.
     */
    getAdminVoucherStep(jid: string): StepStatus | undefined {
        const adminSession = this.adminVoucherSessions.get(jid);
        if (adminSession) {
            if (Date.now() - adminSession.lastUpdated > 300000) {
                this.adminVoucherSessions.delete(jid);
                return undefined;
            }
            return adminSession.step;
        }
        return undefined;
    }

    /**
     * Gets the active admin voucher draft if any.
     */
    getAdminVoucherDraft(jid: string): AdminVoucherDraft | undefined {
        return this.adminVoucherSessions.get(jid)?.draft;
    }

    /**
     * Clears admin interactive voucher step and resets wizard state.
     */
    clearAdminVoucher(jid: string): void {
        this.adminVoucherSessions.delete(jid);
        const current = this.sessions.get(jid);
        if (current && current.step.startsWith("ADMIN_AWAITING_VOUCHER_")) {
            current.step = "IDLE";
            current.adminVoucherDraft = undefined;
            current.lastUpdated = Date.now();
        }
    }
}


