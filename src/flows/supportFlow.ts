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

export async function startUserLiveChat(
    remoteJid: string,
    ctx: BotContext,
    userLang: Language,
    orderId?: string,
    reason?: string,
    effectiveSender?: string
): Promise<void> {
    const session = ctx.state.getSession(remoteJid);
    const targetOrderId = orderId || session.pendingSupportOrderId;
    ctx.state.startLiveChat(remoteJid, targetOrderId);

    const activeLiveMsg = t("support.activeLiveMsg", userLang, { store: config.STORE_NAME });
    await ctx.sendText(remoteJid, activeLiveMsg);

    if (ctx.adminLogger) {
        const retry = session.retryOrder || session.lastFailedOrder;
        await ctx.adminLogger.notifySupportRequest({
            orderId: targetOrderId || retry?.orderId,
            itemName: retry?.itemName,
            gamertag: (retry as any)?.newGamertag || (retry as any)?.oldGamertag || (retry as any)?.gamertag,
            attempts: retry?.attempts,
            platformUserId: effectiveSender || remoteJid,
            reason: reason || (retry?.attempts && retry.attempts >= 3
                ? t("support.reasonGamertagNotFound", userLang, { attempts: retry.attempts })
                : t("support.reasonCustomerStarted", userLang))
        });
    }
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

    const trimmed = text.trim();

    const isYes =
        trimmed === "btn_support_confirm" ||
        trimmed === "btn_start_livechat" ||
        trimmed.startsWith("btn_start_livechat_");

    const isCancel =
        trimmed === "btn_support_cancel" ||
        trimmed === "btn_cancel_order";

    if (isYes) {
        const orderIdMatch = trimmed.startsWith("btn_start_livechat_")
            ? trimmed.replace("btn_start_livechat_", "")
            : session.pendingSupportOrderId;
        await startUserLiveChat(remoteJid, ctx, userLang, orderIdMatch, undefined, effectiveSender);
        return true;
    }

    if (isCancel) {
        ctx.state.cancelSupportConsent(remoteJid);
        const cancelNotice = t("support.cancelledNotice", userLang);
        await ctx.sendText(remoteJid, cancelNotice);
        return true;
    }

    // Zero-Text Policy: ignore free-form manual text; user must interact via buttons
    return true;
}
