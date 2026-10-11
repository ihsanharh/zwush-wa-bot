import type { CoreClient } from "../coreClient";
import type { StateManager } from "../state";
import type { CatalogItem } from "../types";
import type { AdminGroupLogger } from "./adminLogger";
import { formatStatusBadge, formatRupiah, t, type Language } from "../i18n";
import { config } from "../config";
import {
    CATEGORIES,
    type CategoryDefinition,
    resolveCategory,
    currentStoreDiscount,
    getKnownStoreDiscount,
    setKnownStoreDiscount
} from "../utils/categories";
import {
    formatStatusText,
    renderMainMenu,
    renderOrderCategoryMenu,
    renderCategoryItems,
    sendCategoryOrderPoster
} from "../utils/formatters";
import {
    extractMessageText,
    extractQuotedMessageId,
    isPrivateChat,
    extractEventTimestampSeconds,
    isEventStale,
    extractPhoneNumber,
    isUserAdmin,
    executeUserSequential,
    sendUnrecognizedCommand,
    GREETINGS
} from "../utils/messageUtils";
import { defaultRegistry } from "../commands";
import { isLiveChatActive, isAwaitingSupportConfirmation, handleSupportConfirmation } from "../flows/supportFlow";
import { handleBuyingFlow } from "../flows/buyingFlow";
import statusCommand from "../commands/general/status";
import cancelCommand from "../commands/general/cancel";
import checkPaymentCommand from "../commands/general/checkPayment";
import { isCancelKeyword } from "../i18n";

// Re-exports for backward compatibility
export {
    formatStatusBadge,
    formatRupiah,
    CATEGORIES,
    type CategoryDefinition,
    resolveCategory,
    currentStoreDiscount,
    getKnownStoreDiscount,
    setKnownStoreDiscount,
    formatStatusText,
    renderMainMenu,
    renderOrderCategoryMenu,
    renderCategoryItems,
    sendCategoryOrderPoster,
    extractMessageText,
    extractQuotedMessageId,
    isPrivateChat,
    extractEventTimestampSeconds,
    isEventStale,
    extractPhoneNumber,
    isUserAdmin,
    executeUserSequential,
    sendUnrecognizedCommand
};

export { catalogCommand as handleKatalogCommand } from "../commands/general/catalog";

export interface BotContext {
    client: CoreClient;
    state: StateManager;
    adminLogger?: AdminGroupLogger;
    qrDeleter?: (jid: string, key?: any) => Promise<void>;
    sendText(jid: string, text: string, mentions?: string[]): Promise<void>;
    sendImage(jid: string, buffer: Buffer, caption?: string): Promise<any>;
    sendPoll?(jid: string, title: string, options: string[]): Promise<void>;
    sendList?(jid: string, payload: any): Promise<any>;
    sendButtons?(jid: string, payload: any): Promise<any>;
    uploadMedia?(buffer: Buffer, mimetype?: string): Promise<any>;
}

export function isBuyingFlowActive(ctx: BotContext, remoteJid: string): boolean {
    const session = ctx.state.getSession(remoteJid);
    const activeOrderId = ctx.state.getActiveOrderId(remoteJid);
    return (
        session.step === "AWAITING_GAMERTAG" ||
        session.step === "AWAITING_CONFIRMATION" ||
        session.step === "AWAITING_VOUCHER_CODE" ||
        Boolean(activeOrderId)
    );
}

export async function handleIncomingMessage(
    remoteJidOrEvent: string | unknown,
    fromMeOrCtx: boolean | BotContext,
    bodyText?: string,
    ctx?: BotContext,
    participant?: string,
    timestampSeconds?: number,
    quotedMessageId?: string
): Promise<void> {
    let remoteJid: string | undefined;
    let fromMe = false;
    let text = "";
    let context: BotContext;
    let part = participant;
    let quotedId = quotedMessageId;

    if (typeof remoteJidOrEvent === "string") {
        remoteJid = remoteJidOrEvent;
        fromMe = Boolean(fromMeOrCtx);
        text = bodyText || "";
        context = ctx!;
        part = participant;
    } else {
        const staleCheck = isEventStale(remoteJidOrEvent);
        if (staleCheck.stale) return;

        const ev = remoteJidOrEvent as Record<string, any>;
        remoteJid = ev?.key?.remoteJid;
        fromMe = Boolean(ev?.key?.fromMe);
        part = ev?.key?.participant || ev?.participant;
        text = extractMessageText(ev?.message) || "";
        context = fromMeOrCtx as BotContext;
        if (!quotedId) {
            quotedId = extractQuotedMessageId(ev?.message);
        }
    }

    if (!remoteJid || !context) return;
    if (!text || !text.trim()) return;

    const userKey = remoteJid.endsWith("@g.us")
        ? `${remoteJid}:${part || remoteJid}`
        : remoteJid;

    await executeUserSequential(userKey, () =>
        handleIncomingMessageInternal(remoteJid!, fromMe, text, context, part, quotedId)
    );
}

async function handleIncomingMessageInternal(
    remoteJid: string,
    fromMe: boolean,
    bodyText: string,
    ctx: BotContext,
    participant?: string,
    quotedMessageId?: string
): Promise<void> {
    const isGroup = remoteJid.endsWith("@g.us");
    if (!isPrivateChat(remoteJid) && !isGroup) {
        return;
    }

    const trimmed = bodyText.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();

    // Determine sender identity and language preference
    const effectiveSender = isGroup ? (participant || remoteJid) : remoteJid;
    const userLang = ctx.state.getLanguage(effectiveSender);
    const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminLogger);

    // If message comes from Admin Group, register the participant as an authorized admin for private chat
    if (isGroup && ctx.adminLogger && remoteJid === ctx.adminLogger.getAdminGroupJid() && participant) {
        ctx.adminLogger.addAdminUser(participant);
    }

    // Maintenance Mode enforcement:
    // If maintenance mode is active, the bot ONLY responds to admins or in the admin group.
    // For non-admins:
    // - In group chats: silently ignore.
    // - In private chat: send maintenance notice with 5-second cooldown; no greetings or order flows.
    if (ctx.state.isMaintenanceMode && ctx.state.isMaintenanceMode() && !isAdmin) {
        if (isGroup) {
            return;
        }
        const now = Date.now();
        const lastGreeting = ctx.state.getLastGreetingAt(remoteJid) || 0;
        if (now - lastGreeting < 5000) {
            return; // 5-second anti-spam cooldown: drop silently
        }
        ctx.state.setLastGreetingAt(remoteJid, now);
        await ctx.sendText(remoteJid, t("maintenanceNotice", userLang, { store: config.STORE_NAME }));
        return;
    }

    // 1. Group Chat Routing
    if (isGroup) {
        const adminGroupJid = ctx.adminLogger?.getAdminGroupJid();
        // Commands and admin interactions are strictly for the Admin Group
        if (adminGroupJid && remoteJid !== adminGroupJid) {
            return;
        }

        if (!participant) {
            return;
        }

        if (isAdmin && (trimmed.startsWith("admin_") || trimmed.startsWith("cmd_"))) {
            const handledAdminAction = await handleAdminActionClick(
                remoteJid,
                trimmed,
                effectiveSender,
                true,
                userLang,
                ctx
            );
            if (handledAdminAction) return;
        }

        if (!trimmed.startsWith("/")) {
            return;
        }

        // Non-admins have no commands in groups
        if (!isAdmin) {
            return;
        }

        const parts = trimmed.split(/\s+/);
        const cmd = parts[0]?.toLowerCase() || "";
        const args = parts.slice(1);

        const handled = await defaultRegistry.dispatch(cmd, {
            remoteJid,
            sender: effectiveSender,
            args,
            rawText: trimmed,
            isGroup: true,
            isAdmin: true,
            userLang,
            ctx
        });

        if (!handled) {
            await sendUnrecognizedCommand(remoteJid, cmd, userLang, ctx, effectiveSender);
        }
        return;
    }

    // 2. Private 1:1 Chat Routing
    // Live chat active: bot is paused so admin can chat directly with customer via WhatsApp web/app
    if (isLiveChatActive(remoteJid, ctx)) {
        return;
    }

    // Awaiting support confirmation prompt
    if (isAwaitingSupportConfirmation(remoteJid, ctx)) {
        await handleSupportConfirmation(remoteJid, trimmed, ctx, userLang, effectiveSender);
        return;
    }

    // Prevent bot self-reply loops: ignore messages fromMe in private chat
    if (fromMe) {
        return;
    }

    const session = ctx.state.getSession(remoteJid);
    const activeOrderId = ctx.state.getActiveOrderId(remoteJid);
    const buyingActive = isBuyingFlowActive(ctx, remoteJid);

    // Stale quoted message drop during active buying flow
    if (buyingActive && quotedMessageId) {
        if (!ctx.state.isPromptMessageValid(remoteJid, quotedMessageId)) {
            const expectedPromptId = ctx.state.getPromptMessageId(remoteJid);
            console.log(`[BuyingFlow] Ignored interaction quoting stale message ${quotedMessageId} (expected ${expectedPromptId}) from ${remoteJid}`);
            return;
        }
    }

    // In private chat: NO SLASH COMMANDS AT ALL! (Commands are strictly exclusive to the admin group)
    // Both normal users and admins are treated identically here (buttons-only, interactive UI).
    // Admin only bypasses maintenance mode.
    if (trimmed.startsWith("/")) {
        // In active buying flow:
        if (buyingActive) {
            if (session.step === "AWAITING_GAMERTAG") {
                // Pass through to gamertag validation in handleBuyingFlow (will report invalid gamertag format)
            } else {
                // Silently drop slash commands during confirmation, voucher, or pending payment
                return;
            }
        } else {
            // When IDLE: slash command attempts are treated as ordinary text (falls through to greeting welcome buttons)
        }
    }

    // Quick-reply invoice button check (only allowed if there is an active pending order)
    if (trimmed === "btn_check_payment" || trimmed === "act_check_status") {
        if (activeOrderId) {
            await checkPaymentCommand.execute({
                remoteJid,
                sender: effectiveSender,
                args: [],
                rawText: trimmed,
                isGroup: false,
                isAdmin,
                userLang,
                ctx
            });
        }
        return;
    }

    // Bare cancel keyword or quick-reply cancel button check
    if (trimmed === "btn_cancel_order" || isCancelKeyword(trimmed, userLang)) {
        if (
            trimmed === "btn_cancel_order" ||
            activeOrderId ||
            (session.step !== "IDLE" &&
                session.step !== "LIVE_CHAT" &&
                session.step !== "AWAITING_SUPPORT_CONFIRMATION" &&
                session.step !== "AWAITING_RETRY_GAMERTAG" &&
                session.step !== "AWAITING_RETRY_CONFIRMATION")
        ) {
            await cancelCommand.execute({
                remoteJid,
                sender: effectiveSender,
                args: [],
                rawText: trimmed,
                isGroup: false,
                isAdmin,
                userLang,
                ctx
            });
            return;
        }
    }

    // Quick-entry buttons from welcome greeting (only active when session is IDLE and no active pending order)
    if (session.step === "IDLE" && !activeOrderId) {
        if (trimmed === "btn_start_buying") {
            const { menuCommand } = await import("../commands/general/menu");
            await menuCommand.execute({
                remoteJid,
                sender: effectiveSender,
                args: [],
                rawText: trimmed,
                isGroup: false,
                isAdmin,
                userLang,
                ctx
            });
            return;
        }

        if (trimmed === "btn_history" || trimmed.startsWith("btn_hist_page_")) {
            const pageArgs = trimmed.startsWith("btn_hist_page_") ? [trimmed.replace("btn_hist_page_", "")] : [];
            const { historyCommand } = await import("../commands/general/history");
            await historyCommand.execute({
                remoteJid,
                sender: effectiveSender,
                args: pageArgs,
                rawText: trimmed,
                isGroup: false,
                isAdmin,
                userLang,
                ctx
            });
            return;
        }

        if (trimmed === "btn_settings") {
            if (ctx.sendList) {
                const { buildSettingsListMenu } = await import("../utils/interactiveBuilders");
                await ctx.sendList(remoteJid, buildSettingsListMenu(userLang));
            }
            return;
        }

        if (trimmed === "act_switch_lang") {
            const nextLang: Language = userLang === "id" ? "en" : "id";
            ctx.state.setLanguage(remoteJid, nextLang);
            if (ctx.sendButtons) {
                const { buildWelcomeButtons } = await import("../utils/interactiveBuilders");
                await ctx.sendButtons(remoteJid, buildWelcomeButtons(nextLang));
            } else {
                await ctx.sendText(remoteJid, t("languageSwitched", nextLang));
            }
            return;
        }

        if (trimmed === "act_view_faq") {
            const faqText = t("faqMessage", userLang, { storeUpper: config.STORE_NAME.toUpperCase() });
            await ctx.sendText(remoteJid, faqText);
            return;
        }

        if (trimmed === "btn_help") {
            if (ctx.sendButtons) {
                const { buildWelcomeButtons } = await import("../utils/interactiveBuilders");
                await ctx.sendButtons(remoteJid, buildWelcomeButtons(userLang));
            } else {
                await ctx.sendText(remoteJid, t("greeting", userLang));
            }
            return;
        }

        // Stale interactive button/list clicks when session is IDLE are silently dropped
        if (/^(btn_|act_|opt_)/.test(trimmed)) {
            return;
        }
    }

    // Interactive buying wizard flow (or idle category direct selection)
    const handledByFlow = await handleBuyingFlow(
        remoteJid,
        fromMe,
        trimmed,
        ctx,
        userLang,
        effectiveSender
    );
    if (handledByFlow) {
        return;
    }

    // Bare order ID inquiry (e.g. user sends "ORD-ABC123" or "#ORD-ABC123")
    const orderMatch = trimmed.match(/^#?(ORD-[A-Z0-9]{4,10})$/i);
    if (orderMatch && orderMatch[1]) {
        if (!buyingActive) {
            await statusCommand.execute({
                remoteJid,
                sender: effectiveSender,
                args: [orderMatch[1].toUpperCase()],
                rawText: trimmed,
                isGroup: false,
                isAdmin,
                userLang,
                ctx
            });
        }
        return;
    }

    // When IDLE: any message received triggers the welcome interactive greeting (with 5-second anti-spam cooldown)
    if (session.step === "IDLE" && !activeOrderId) {
        const now = Date.now();
        const lastGreeting = ctx.state.getLastGreetingAt(remoteJid) || 0;
        if (now - lastGreeting < 5000) {
            return; // 5-second anti-spam cooldown: silently drop to avoid flooding customer
        }
        ctx.state.setLastGreetingAt(remoteJid, now);

        if (ctx.sendButtons) {
            const { buildWelcomeButtons } = await import("../utils/interactiveBuilders");
            await ctx.sendButtons(remoteJid, buildWelcomeButtons(userLang));
        } else {
            await ctx.sendText(remoteJid, t("greeting", userLang));
        }
        return;
    }

    // Non-command, non-greeting messages outside active flow are ignored
    return;
}

async function handleAdminActionClick(
    remoteJid: string,
    actionId: string,
    effectiveSender: string,
    isGroup: boolean,
    userLang: Language,
    ctx: BotContext
): Promise<boolean> {
    if (actionId.startsWith("admin_reprocess_") || actionId.startsWith("btn_admin_reprocess_")) {
        const orderId = actionId.replace(/^(btn_)?admin_reprocess_/, "");
        const cmd = defaultRegistry.get("/reprocess");
        if (cmd) {
            await cmd.execute({
                remoteJid,
                sender: effectiveSender,
                args: [orderId],
                rawText: `/reprocess ${orderId}`,
                isGroup,
                isAdmin: true,
                userLang,
                ctx
            });
        }
        return true;
    }

    if (actionId.startsWith("admin_done_") || actionId.startsWith("btn_admin_done_")) {
        const orderId = actionId.replace(/^(btn_)?admin_done_/, "");
        const cmd = defaultRegistry.get("/done");
        if (cmd) {
            await cmd.execute({
                remoteJid,
                sender: effectiveSender,
                args: [orderId],
                rawText: `/done ${orderId}`,
                isGroup,
                isAdmin: true,
                userLang,
                ctx
            });
        }
        return true;
    }

    if (actionId.startsWith("admin_cancel_") || actionId.startsWith("btn_admin_cancel_")) {
        const orderId = actionId.replace(/^(btn_)?admin_cancel_/, "");
        const cmd = defaultRegistry.get("/batal") || defaultRegistry.get("/cancel");
        if (cmd) {
            await cmd.execute({
                remoteJid,
                sender: effectiveSender,
                args: [orderId],
                rawText: `/cancel ${orderId}`,
                isGroup,
                isAdmin: true,
                userLang,
                ctx
            });
        }
        return true;
    }

    if (actionId === "cmd_orders_pending") {
        const cmd = defaultRegistry.get("/orders");
        if (cmd) {
            await cmd.execute({
                remoteJid,
                sender: effectiveSender,
                args: ["pending"],
                rawText: "/orders pending",
                isGroup,
                isAdmin: true,
                userLang,
                ctx
            });
        }
        return true;
    }

    if (actionId === "cmd_reprocess_all") {
        const cmd = defaultRegistry.get("/reprocess");
        if (cmd) {
            await cmd.execute({
                remoteJid,
                sender: effectiveSender,
                args: ["all"],
                rawText: "/reprocess all",
                isGroup,
                isAdmin: true,
                userLang,
                ctx
            });
        }
        return true;
    }

    if (actionId === "cmd_paid_latest") {
        const cmd = defaultRegistry.get("/paid");
        if (cmd) {
            await cmd.execute({
                remoteJid,
                sender: effectiveSender,
                args: [],
                rawText: "/paid",
                isGroup,
                isAdmin: true,
                userLang,
                ctx
            });
        }
        return true;
    }

    if (actionId === "cmd_done_latest") {
        const cmd = defaultRegistry.get("/done");
        if (cmd) {
            await cmd.execute({
                remoteJid,
                sender: effectiveSender,
                args: [],
                rawText: "/done",
                isGroup,
                isAdmin: true,
                userLang,
                ctx
            });
        }
        return true;
    }

    if (actionId === "cmd_livechats") {
        const cmd = defaultRegistry.get("/livechats");
        if (cmd) {
            await cmd.execute({
                remoteJid,
                sender: effectiveSender,
                args: [],
                rawText: "/livechats",
                isGroup,
                isAdmin: true,
                userLang,
                ctx
            });
        }
        return true;
    }

    return false;
}
