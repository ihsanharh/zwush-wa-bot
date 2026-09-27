import type { CatalogItem, OrderNotificationPayload, OrderStatus } from "./types";
import { config } from "./config";
import idLocale from "./locales/id.json";
import enLocale from "./locales/en.json";

export type Language = "id" | "en";

export const locales = {
    id: idLocale,
    en: enLocale,
};

export function formatRupiah(amount: number): string {
    return `Rp ${amount.toLocaleString("id-ID")}`;
}

export function formatStatusBadge(status: string, lang: Language = "id", failureReason?: string | null): string {
    const key = `status.${status}`;
    const badge = t(key, lang, { reason: failureReason || t("unknown", lang) });
    return badge !== key ? badge : status;
}

export function formatStatusNotification(
    payload: OrderNotificationPayload,
    lang: Language = "id",
    storeName?: string
): string {
    const { orderId, gamertag, itemName, status, message } = payload;
    const store = storeName || config.STORE_NAME || "Store";
    const key = `notification.${status}`;

    const formatted = t(key, lang, {
        orderId,
        gamertag,
        itemName,
        store,
        message: message || t("unknown", lang)
    });

    if (formatted !== key) {
        return formatted;
    }

    return t("statusNotificationFallback", lang, { orderId, status });
}

export function formatPlayerNotFoundRetry(
    orderId: string,
    itemName: string,
    gamertag: string,
    attempt: number,
    maxAttempts: number = 3,
    lang: Language = "id"
): string {
    return t("playerNotFound.retry", lang, {
        orderId,
        itemName,
        gamertag,
        attempt,
        maxAttempts
    });
}

export function formatPlayerNotFoundMaxExceeded(
    orderId: string,
    itemName: string,
    gamertag: string,
    lang: Language = "id"
): string {
    return t("playerNotFound.maxExceeded", lang, {
        orderId,
        itemName,
        gamertag
    });
}

export interface StringParams {
    phone?: string;
    orderId?: string;
    itemName?: string;
    gamertag?: string;
    totalNominal?: number;
    count?: number;
    catName?: string;
    storeName?: string;
    isAdmin?: boolean;
    code?: string;
    discountNominal?: number;
    finalPrice?: number;
    percent?: number;
    discountType?: string;
    discountValue?: string | number;
    maxUses?: string | number | null;
    attempt?: number;
    maxAttempts?: number;
    reason?: string;
    message?: string;
    command?: string;
    senderPhone?: string;
    [key: string]: any;
}

export function t(key: string, lang: Language = "id", params?: StringParams): string {
    const store = params?.storeName || config.STORE_NAME || "Store";
    const storeUpper = store.toUpperCase();

    // Special composite translations
    if (key === "greeting") {
        const discountText = params?.percent
            ? t("discountTextWithPercent", lang, { percent: params.percent })
            : t("discountTextSpecial", lang);
        return rawTranslate("greeting", lang, {
            ...params,
            store,
            discountText
        });
    }

    if (key === "helpMessage") {
        let msg = rawTranslate("helpMessage", lang, { ...params, store, storeUpper });
        if (params?.isAdmin) {
            msg += rawTranslate("helpAdminSection", lang, params);
        }
        return msg;
    }

    if (key === "faqMessage") {
        return rawTranslate("faqMessage", lang, { ...params, store, storeUpper });
    }

    if (key === "voucherApplied") {
        return rawTranslate("voucherApplied", lang, {
            ...params,
            discountFormatted: formatRupiah(params?.discountNominal || 0),
            finalFormatted: formatRupiah(params?.finalPrice || 0)
        });
    }

    return rawTranslate(key, lang, { ...params, store, storeUpper });
}

function rawTranslate(key: string, lang: Language, params?: Record<string, any>): string {
    const targetDict = locales[lang] || locales.id;
    let val: any = resolveNestedKey(targetDict, key);

    if (typeof val !== "string") {
        const fallbackDict = locales.id;
        val = resolveNestedKey(fallbackDict, key);
    }

    if (typeof val !== "string") {
        return key;
    }

    if (params) {
        val = val.replace(/\{\{(\w+)\}\}/g, (_: string, prop: string) => {
            if (params[prop] !== undefined && params[prop] !== null) {
                return String(params[prop]);
            }
            return "";
        });
    }

    return val;
}

function resolveNestedKey(obj: any, path: string): any {
    if (!obj || typeof obj !== "object") return undefined;
    if (path in obj) return obj[path];

    const parts = path.split(".");
    let curr = obj;
    for (const part of parts) {
        if (curr && typeof curr === "object" && part in curr) {
            curr = curr[part];
        } else {
            return undefined;
        }
    }
    return curr;
}
