import type { BotContext } from "../handlers/message";
import { t, type Language } from "../i18n";
import { config } from "../config";

export function isLiveChatActive(remoteJid: string, ctx: BotContext): boolean {
    const session = ctx.state.getSession(remoteJid);
    return session.step === "LIVE_CHAT";
}

export function isAwaitingSupportConfirmation(remoteJid: string, ctx: BotContext): boolean {
    const session = ctx.state.getSession(remoteJid);
    return session.step === "AWAITING_SUPPORT_CONFIRMATION";
}

export async function handleSupportConfirmation(
    remoteJid: string,
    text: string,
    ctx: BotContext,
    userLang: Language,
    effectiveSender?: string
): Promise<boolean> {
    const session = ctx.state.getSession(remoteJid);
    if (session.step !== "AWAITING_SUPPORT_CONFIRMATION") {
        return false;
    }

    const lower = text.trim().toLowerCase();

    const isYes =
        lower === "ya" ||
        lower === "yes" ||
        lower === "y" ||
        lower === "1" ||
        lower === "lanjut" ||
        lower === "oke" ||
        lower === "ok" ||
        lower === "siap";

    const isCancel =
        lower === "batal" ||
        lower === "cancel" ||
        lower === "tidak" ||
        lower === "no" ||
        lower === "gak" ||
        lower === "ngga" ||
        lower === "c" ||
        lower === "b";

    if (isYes) {
        const targetOrderId = session.pendingSupportOrderId;
        ctx.state.startLiveChat(remoteJid, targetOrderId);

        const activeLiveMsg = t("support.activeLiveMsg", userLang, { store: config.STORE_NAME });
        await ctx.sendText(remoteJid, activeLiveMsg);

        // Alert admin group
        if (ctx.adminLogger) {
            const retry = session.retryOrder || session.lastFailedOrder;
            await ctx.adminLogger.notifySupportRequest({
                orderId: targetOrderId || retry?.orderId,
                itemName: retry?.itemName,
                gamertag: (retry as any)?.newGamertag || (retry as any)?.oldGamertag || (retry as any)?.gamertag,
                attempts: retry?.attempts,
                platformUserId: effectiveSender || remoteJid,
                reason: retry?.attempts && retry.attempts >= 3
                    ? `Gamertag tidak ditemukan di The Hive setelah ${retry.attempts}x percobaan`
                    : "Pelanggan menyetujui masuk ke mode Live Chat Support via /support"
            });
        }
        return true;
    }

    if (isCancel) {
        ctx.state.cancelSupportConsent(remoteJid);
        const cancelNotice = t("support.cancelledNotice", userLang);
        await ctx.sendText(remoteJid, cancelNotice);
        return true;
    }

    const promptHint = t("support.consentHint", userLang);
    await ctx.sendText(remoteJid, promptHint);
    return true;
}
