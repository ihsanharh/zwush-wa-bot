import type { CatalogItem } from "./types";
import type { Language } from "./i18n";

export type StepStatus =
    | "IDLE"
    | "AWAITING_CATEGORY"
    | "AWAITING_ITEM"
    | "AWAITING_GAMERTAG"
    | "AWAITING_CONFIRMATION";

export interface AppliedVoucherInfo {
    code: string;
    discountNominal: number;
    finalPrice: number;
}

export interface UserSession {
    step: StepStatus;
    selectedCategory?: string;
    selectedItem?: CatalogItem;
    gamertag?: string;
    appliedVoucher?: AppliedVoucherInfo;
    lastQrKey?: any;
    language?: Language;
    lastUpdated: number;
    lastCancelledAt?: number;
    lastBackAt?: number;
}

export class StateManager {
    private readonly sessions = new Map<string, UserSession>();
    private readonly userLanguages = new Map<string, Language>();
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

        if (this.isExpired(existing)) {
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
        this.sessions.set(jid, {
            step: "AWAITING_CATEGORY",
            language: this.getLanguage(jid),
            lastUpdated: Date.now()
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
}
