import type { CoreClient } from "../coreClient";
import type { StateManager } from "../state";
import type { AdminGroupLogger } from "./adminLogger";
import { formatStatusBadge, formatRupiah, t, type Language } from "../i18n";
import { config } from "../config";
import {
    CATEGORIES,
    type CategoryDefinition,
    resolveCategory
} from "../utils/categories";
import {
    formatStatusText,
    renderOrderCategoryMenu
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
    extractMentionedJids,
    isBotMentioned,
    isBotTaggedOrCalled
} from "../utils/messageUtils";
import {
    isLiveChatActive,
    isAwaitingSupportConfirmation,
    handleSupportConfirmation,
    startUserLiveChat
} from "../flows/supportFlow";
import { handleBuyingFlow } from "../flows/buyingFlow";
import { handleAdminAction } from "./adminActions";
import { handleAdminVoucherAction, handleAdminVoucherTextInput, showAdminVoucherDetail } from "./adminVouchers";
import {
    buildAdminPanelMenu,
    buildAdminPanelQuickReply,
    buildCategoryListMenu,
    buildOrderCancelledButtons,
    buildOrderHistoryButtons,
    buildSettingsListMenu,
    buildWelcomeButtons,
    buildPaymentPendingButtons,
    buildOrderExpiredButtons
} from "../utils/interactiveBuilders";

// Re-exports for backward compatibility
export {
    formatStatusBadge,
    formatRupiah,
    CATEGORIES,
    type CategoryDefinition,
    resolveCategory,
    formatStatusText,
    renderOrderCategoryMenu,
    extractMessageText,
    extractQuotedMessageId,
    isPrivateChat,
    extractEventTimestampSeconds,
    isEventStale,
    extractPhoneNumber,
    isUserAdmin,
    executeUserSequential,
    extractMentionedJids,
    isBotMentioned,
    isBotTaggedOrCalled
};

export interface BotContext {
    client: CoreClient;
    state: StateManager;
    adminLogger?: AdminGroupLogger;
    qrDeleter?: (jid: string, key?: any) => Promise<void>;
    botJid?: string;
    botLid?: string;
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
    quotedMessageId?: string,
    mentionedJidsList?: string[]
): Promise<void> {
    let remoteJid: string | undefined;
    let fromMe = false;
    let text = "";
    let context: BotContext;
    let part = participant;
    let quotedId = quotedMessageId;
    let mentionedJids: string[] = mentionedJidsList || [];

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
        if (mentionedJids.length === 0) {
            mentionedJids = extractMentionedJids(ev?.message);
        }
    }

    if (!remoteJid || !context) return;
    if (!text || !text.trim()) return;

    const userKey = remoteJid.endsWith("@g.us")
        ? `${remoteJid}:${part || remoteJid}`
        : remoteJid;

    await executeUserSequential(userKey, () =>
        handleIncomingMessageInternal(remoteJid!, fromMe, text, context, part, quotedId, mentionedJids)
    );
}

async function handleIncomingMessageInternal(
    remoteJid: string,
    fromMe: boolean,
    bodyText: string,
    ctx: BotContext,
    participant?: string,
    quotedMessageId?: string,
    mentionedJids: string[] = []
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
        const logGroupJid = ctx.adminLogger?.getLogGroupJid();

        // Admin action buttons (btn_admin_* or admin_*) are valid in either Admin Group or Log Group
        const isAuthorizedGroup =
            (!adminGroupJid && !logGroupJid) ||
            remoteJid === adminGroupJid ||
            remoteJid === logGroupJid;

        if (!isAuthorizedGroup) {
            return;
        }

        if (!participant) {
            return;
        }

        // Admin action button clicks
        if (isAdmin && (trimmed.startsWith("admin_") || trimmed.startsWith("btn_admin_") || trimmed.startsWith("cmd_"))) {
            const handledAdminAction = await handleAdminAction(
                remoteJid,
                trimmed,
                effectiveSender,
                true,
                userLang,
                ctx
            );
            if (handledAdminAction) return;
        }

        // Admin interactive voucher wizard text input
        if (isAdmin) {
            const adminStep = ctx.state.getAdminVoucherStep
                ? ctx.state.getAdminVoucherStep(effectiveSender)
                : ctx.state.getSession(effectiveSender).step;
            if (adminStep && adminStep.startsWith("ADMIN_AWAITING_VOUCHER_")) {
                const handledVoucherInput = await handleAdminVoucherTextInput(
                    remoteJid,
                    trimmed,
                    effectiveSender,
                    true,
                    userLang,
                    ctx
                );
                if (handledVoucherInput) return;
            }
        }

        // Only admins can trigger bot interactions in groups
        if (!isAdmin) {
            return;
        }

        // Admin group interactions
        const isAdminGroup = !adminGroupJid || remoteJid === adminGroupJid;
        if (isAdminGroup) {
            const isMention = trimmed === "@" || isBotMentioned(trimmed, mentionedJids, ctx.botJid, ctx.botLid);

            // Clean any @bot mentions from command text
            let cleanCmd = trimmed.trim();
            if (ctx.botJid) {
                const phone = extractPhoneNumber(ctx.botJid);
                if (phone) cleanCmd = cleanCmd.replace(new RegExp(`@${phone}\\b`, "gi"), "");
            }
            if (ctx.botLid) {
                const lid = extractPhoneNumber(ctx.botLid);
                if (lid) cleanCmd = cleanCmd.replace(new RegExp(`@${lid}\\b`, "gi"), "");
            }
            cleanCmd = cleanCmd.replace(/^@\s*/, "").trim().toLowerCase();

            // 1. Direct Voucher Keywords
            if (
                cleanCmd === "voucher" ||
                cleanCmd === "vouchers" ||
                cleanCmd === "cek voucher" ||
                cleanCmd === "kelola voucher" ||
                cleanCmd.startsWith("!voucher") ||
                cleanCmd.startsWith("/voucher") ||
                cleanCmd.startsWith("voucher ")
            ) {
                const parts = cleanCmd.split(/\s+/);
                if (parts.length > 1 && parts[1]) {
                    const handledVoucherDirect = await showAdminVoucherDetail(
                        remoteJid,
                        parts[1],
                        effectiveSender,
                        true,
                        userLang,
                        ctx
                    );
                    if (handledVoucherDirect) return;
                }
                await handleAdminVoucherAction(remoteJid, "admin_panel_vouchers", effectiveSender, true, userLang, ctx);
                return;
            }

            if (cleanCmd === "list voucher" || cleanCmd === "daftar voucher") {
                await handleAdminVoucherAction(remoteJid, "btn_admin_voucher_list", effectiveSender, true, userLang, ctx);
                return;
            }

            if (cleanCmd === "buat voucher" || cleanCmd === "tambah voucher") {
                await handleAdminVoucherAction(remoteJid, "btn_admin_voucher_create", effectiveSender, true, userLang, ctx);
                return;
            }

            // 2. Direct Saldo Keywords
            if (cleanCmd === "saldo" || cleanCmd.startsWith("!saldo") || cleanCmd.startsWith("/saldo")) {
                await handleAdminAction(remoteJid, "admin_panel_balance", effectiveSender, true, userLang, ctx);
                return;
            }

            // 3. Direct Orders Keywords
            if (cleanCmd === "pesanan" || cleanCmd === "orders" || cleanCmd.startsWith("!pesanan") || cleanCmd.startsWith("/orders")) {
                await handleAdminAction(remoteJid, "admin_panel_orders", effectiveSender, true, userLang, ctx);
                return;
            }

            // 4. Direct Maintenance Keywords
            if (cleanCmd === "maintenance" || cleanCmd.startsWith("!maintenance") || cleanCmd.startsWith("/maintenance")) {
                await handleAdminAction(remoteJid, "admin_panel_maintenance", effectiveSender, true, userLang, ctx);
                return;
            }

            // 5. Truly mentioned (@<botPhone>, @<botLid>, or mentionedJid) -> Reply with Admin Panel
            if (isMention) {
                const isMaint = ctx.state.isMaintenanceMode ? ctx.state.isMaintenanceMode() : false;
                try {
                    if (ctx.sendList) {
                        await ctx.sendList(remoteJid, buildAdminPanelMenu(userLang, isMaint));
                    } else if (ctx.sendButtons) {
                        await ctx.sendButtons(remoteJid, buildAdminPanelQuickReply(userLang, isMaint));
                    } else {
                        const qr = buildAdminPanelQuickReply(userLang, isMaint);
                        await ctx.sendText(remoteJid, qr.text, [effectiveSender]);
                    }
                } catch (err) {
                    console.error("[Admin Panel] Failed to send list menu, falling back to quick reply / text:", err);
                    if (ctx.sendButtons) {
                        await ctx.sendButtons(remoteJid, buildAdminPanelQuickReply(userLang, isMaint));
                    } else {
                        const qr = buildAdminPanelQuickReply(userLang, isMaint);
                        await ctx.sendText(remoteJid, qr.text, [effectiveSender]);
                    }
                }
                return;
            }
        }

        // Silently drop any other text or slash commands in groups
        return;
    }

    // 2. Private 1:1 Chat Routing
    // Direct Live Chat button click (Zero friction: immediately starts Live Chat without asking YA/Batal)
    if (
        trimmed === "btn_start_livechat" ||
        trimmed.startsWith("btn_start_livechat_") ||
        trimmed === "btn_contact_admin" ||
        trimmed === "btn_support_confirm"
    ) {
        const orderIdMatch = trimmed.startsWith("btn_start_livechat_")
            ? trimmed.replace("btn_start_livechat_", "")
            : undefined;
        await startUserLiveChat(remoteJid, ctx, userLang, orderIdMatch, undefined, effectiveSender);
        return;
    }

    // Live chat active: bot is paused so admin can chat directly with customer via WhatsApp web/app
    if (isLiveChatActive(remoteJid, ctx)) {
        if (trimmed === "btn_cancel_livechat" || trimmed === "btn_cancel_order") {
            ctx.state.endLiveChat(remoteJid);
            await ctx.sendText(remoteJid, t("support.cancelledNotice", userLang));
        }
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

    // Support admin actions and voucher wizard in private chat for admins
    if (isAdmin) {
        if (trimmed.startsWith("admin_") || trimmed.startsWith("btn_admin_") || trimmed.startsWith("cmd_")) {
            const handledAdmin = await handleAdminAction(remoteJid, trimmed, remoteJid, false, userLang, ctx);
            if (handledAdmin) return;
        }
        const adminStep = ctx.state.getAdminVoucherStep
            ? ctx.state.getAdminVoucherStep(remoteJid)
            : session.step;
        if (adminStep && adminStep.startsWith("ADMIN_AWAITING_VOUCHER_")) {
            const handledVoucher = await handleAdminVoucherTextInput(remoteJid, trimmed, remoteJid, false, userLang, ctx);
            if (handledVoucher) return;
        }
    }

    // Quick-reply invoice button check (only allowed if there is an active pending order)
    if (trimmed === "btn_check_payment" || trimmed === "act_check_status") {
        if (activeOrderId) {
            await handleCustomerCheckPayment(remoteJid, activeOrderId, userLang, ctx);
        }
        return;
    }

    // Quick-reply cancel button check
    if (trimmed === "btn_cancel_order") {
        await handleCustomerCancel(remoteJid, activeOrderId, session, userLang, ctx);
        return;
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

    // Stale quoted message drop during active buying flow
    if (buyingActive && quotedMessageId) {
        if (!ctx.state.isPromptMessageValid(remoteJid, quotedMessageId)) {
            const expectedPromptId = ctx.state.getPromptMessageId(remoteJid);
            console.log(`[BuyingFlow] Ignored interaction quoting stale message ${quotedMessageId} (expected ${expectedPromptId}) from ${remoteJid}`);
            return;
        }
    }

    // Quick-entry buttons from welcome greeting (only active when session is IDLE and no active pending order)
    if ((session.step === "IDLE" || !buyingActive) && !activeOrderId) {
        if (trimmed === "btn_start_buying") {
            if (ctx.state.clearAdminVoucher) {
                ctx.state.clearAdminVoucher(remoteJid);
            }
            if (session.step !== "IDLE") {
                session.step = "IDLE";
            }
            if (ctx.sendList) {
                await ctx.sendList(remoteJid, buildCategoryListMenu(CATEGORIES, userLang));
            } else {
                await ctx.sendText(remoteJid, renderOrderCategoryMenu(userLang));
            }
            return;
        }

        if (trimmed === "btn_history" || trimmed.startsWith("btn_hist_page_")) {
            const requestedPage = trimmed.startsWith("btn_hist_page_")
                ? parseInt(trimmed.replace("btn_hist_page_", ""), 10)
                : 1;
            const page = isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage;
            try {
                const orders = await ctx.client.getUserOrders(remoteJid, { page, limit: 5 });
                if (!orders || orders.length === 0) {
                    await ctx.sendText(remoteJid, t("history.empty", userLang));
                    return;
                }
                const historyPayload = buildOrderHistoryButtons(orders, page, 5, userLang);
                if (ctx.sendButtons) {
                    await ctx.sendButtons(remoteJid, historyPayload);
                } else {
                    await ctx.sendText(remoteJid, historyPayload.text);
                }
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("history.fetchError", userLang, { error: errMsg }));
            }
            return;
        }

        if (trimmed === "btn_settings") {
            if (ctx.sendList) {
                await ctx.sendList(remoteJid, buildSettingsListMenu(userLang));
            }
            return;
        }

        if (trimmed === "act_switch_lang") {
            const nextLang: Language = userLang === "id" ? "en" : "id";
            ctx.state.setLanguage(remoteJid, nextLang);
            if (ctx.sendButtons) {
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
            try {
                const cleanId = orderMatch[1].toUpperCase();
                const order = await ctx.client.getOrderStatus(cleanId);
                await ctx.sendText(remoteJid, formatStatusText(order, userLang));
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(
                    remoteJid,
                    t("status.notFound", userLang, { orderId: orderMatch[1].toUpperCase(), error: errMsg })
                );
            }
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
            await ctx.sendButtons(remoteJid, buildWelcomeButtons(userLang));
        } else {
            await ctx.sendText(remoteJid, t("greeting", userLang));
        }
        return;
    }

    // Non-command, non-greeting messages outside active flow are ignored
    return;
}

async function handleCustomerCheckPayment(
    remoteJid: string,
    orderId: string,
    userLang: Language,
    ctx: BotContext
): Promise<void> {
    try {
        const res = await ctx.client.checkOrderPayment(orderId);
        if (!res.success) {
            if (res.code === "COOLDOWN") {
                const msg = t("checkPayment.cooldown", userLang, {
                    seconds: res.remainingSeconds ?? 30,
                    orderId,
                });
                if (ctx.sendButtons) {
                    const sent = await ctx.sendButtons(remoteJid, buildPaymentPendingButtons(msg, userLang));
                    const msgId = sent?.key?.id || sent?.id;
                    if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
                } else {
                    await ctx.sendText(remoteJid, msg);
                }
                return;
            }
            if (res.code === "ORDER_NOT_PAYABLE") {
                const msg = t("checkPayment.expired", userLang, { orderId });
                if (ctx.sendButtons) {
                    const sent = await ctx.sendButtons(remoteJid, buildOrderExpiredButtons(msg, userLang));
                    const msgId = sent?.key?.id || sent?.id;
                    if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
                } else {
                    await ctx.sendText(remoteJid, msg);
                }
                return;
            }
            if (res.code === "NOT_FOUND") {
                await ctx.sendText(remoteJid, t("checkPayment.notFound", userLang, { orderId }));
                return;
            }
            await ctx.sendText(
                remoteJid,
                t("checkPayment.error", userLang, { error: res.message || "Unknown error" })
            );
            return;
        }

        if (res.alreadyProcessed) {
            await ctx.sendText(
                remoteJid,
                t("checkPayment.alreadyPaid", userLang, {
                    orderId,
                    status: res.order?.status || "QUEUED",
                })
            );
            return;
        }

        if (res.verified) {
            await ctx.sendText(
                remoteJid,
                t("checkPayment.success", userLang, {
                    orderId,
                    itemName: res.order?.itemName || "",
                    formattedAmount: formatRupiah(res.order?.totalNominal || 0),
                })
            );
            return;
        }

        const pendingMsg = t("checkPayment.pending", userLang, {
            orderId,
            formattedAmount: formatRupiah(res.order?.totalNominal || 0),
        });
        if (ctx.sendButtons) {
            const sent = await ctx.sendButtons(remoteJid, buildPaymentPendingButtons(pendingMsg, userLang));
            const msgId = sent?.key?.id || sent?.id;
            if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
        } else {
            await ctx.sendText(remoteJid, pendingMsg);
        }
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await ctx.sendText(remoteJid, t("checkPayment.error", userLang, { error: errMsg }));
    }
}

async function handleCustomerCancel(
    remoteJid: string,
    activeOrderId: string | null | undefined,
    session: any,
    userLang: Language,
    ctx: BotContext
): Promise<void> {
    let pendingOrderId = activeOrderId || ctx.state.getActiveOrderId(remoteJid);
    let pendingItemName: string | undefined;

    if (!pendingOrderId) {
        try {
            const userOrders = await ctx.client.getUserOrders(remoteJid);
            const found = userOrders?.find((o) => o.status === "PENDING_PAYMENT");
            if (found) {
                pendingOrderId = found.id;
                pendingItemName = found.itemName;
            }
        } catch {}
    }

    if (pendingOrderId) {
        try {
            const res = await ctx.client.cancelOrder(pendingOrderId, "Cancelled by buyer", { silent: true });
            if (ctx.adminLogger) {
                await ctx.adminLogger.updateOrderStatus(res.orderId, "CANCELLED", {
                    failureReason: "Cancelled by buyer",
                    itemName: res.itemName || pendingItemName,
                    gamertag: res.gamertag,
                    platformUserId: remoteJid,
                });
            }
            if (ctx.qrDeleter) {
                try {
                    await ctx.qrDeleter(remoteJid);
                } catch {}
            }
            ctx.state.clearActiveOrderId(remoteJid);
            ctx.state.clearQrMessageKey(remoteJid);
            ctx.state.clear(remoteJid);

            const msg = t("cancel.orderCancelled", userLang, {
                orderId: res.orderId,
                itemName: res.itemName || pendingItemName || "Item",
            });
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buildOrderCancelledButtons(msg, userLang));
            } else {
                await ctx.sendText(remoteJid, msg);
            }
            return;
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const failMsg = t("cancel.failed", userLang, { orderId: pendingOrderId, error: errMsg });
            await ctx.sendText(remoteJid, failMsg);
            return;
        }
    }

    if (
        session.step !== "IDLE" &&
        session.step !== "LIVE_CHAT" &&
        session.step !== "AWAITING_SUPPORT_CONFIRMATION"
    ) {
        ctx.state.clear(remoteJid);
        const msg = t("cancelSuccess", userLang);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buildOrderCancelledButtons(msg, userLang));
        } else {
            await ctx.sendText(remoteJid, msg);
        }
        return;
    }

    const noPendingMsg = t("cancel.noPending", userLang);
    if (ctx.sendButtons) {
        await ctx.sendButtons(remoteJid, buildOrderCancelledButtons(noPendingMsg, userLang));
    } else {
        await ctx.sendText(remoteJid, noPendingMsg);
    }
}
