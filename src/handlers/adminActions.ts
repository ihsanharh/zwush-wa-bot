import type { BotContext } from "./message";
import { config } from "../config";
import { formatRupiah, t, type Language } from "../i18n";
import { extractPhoneNumber } from "../utils/messageUtils";
import { clearPosterCache } from "../poster";
import {
    buildAdminBalanceButtons,
    buildAdminMaintenanceButtons,
    buildAdminOrderFailureButtons,
    buildAdminPanelMenu,
    buildAdminPanelQuickReply,
    buildQuickReplyPayload,
    buildUserOrderFailureButtons
} from "../utils/interactiveBuilders";

async function getOrderDetails(ctx: BotContext, orderId: string) {
    let buyerJid = "";
    let itemName = "Item";
    let gamertag = "-";
    let status = "";
    try {
        const orderInfo = await ctx.client.getOrderStatus(orderId);
        if (orderInfo) {
            buyerJid = orderInfo.platformUserId || "";
            itemName = orderInfo.itemName || itemName;
            gamertag = orderInfo.gamertag || gamertag;
            status = orderInfo.status || "";
        }
    } catch {}
    return { buyerJid, itemName, gamertag, status };
}

async function notifyFailureWithButtons(
    ctx: BotContext,
    remoteJid: string,
    orderId: string,
    errorMsg: string,
    mentions?: string[],
    buyerJid?: string,
    promptKey: string = "admin.actionQueueFailed"
): Promise<void> {
    try {
        const failPayload = buildAdminOrderFailureButtons(orderId, errorMsg, "id");
        const adminText = t(promptKey, "id", { orderId, error: errorMsg });
        await ctx.sendText(remoteJid, adminText, mentions);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, failPayload);
        }
    } catch {
        await ctx.sendText(remoteJid, t("admin.actionPaidFailed", "id", { orderId, error: errorMsg }), mentions);
    }

    if (buyerJid) {
        try {
            const buyerLang = ctx.state.getLanguage(buyerJid);
            const userBtns = buildUserOrderFailureButtons(orderId, errorMsg, buyerLang);
            if (ctx.sendButtons) {
                await ctx.sendButtons(buyerJid, userBtns);
            } else {
                await ctx.sendText(buyerJid, userBtns.text);
            }
        } catch (buyerErr) {
            console.warn(`[adminAction] Failed to notify buyer ${buyerJid} on failure:`, buyerErr);
        }
    }
}

export async function handleAdminAction(
    remoteJid: string,
    actionId: string,
    effectiveSender: string,
    isGroup: boolean,
    _userLang: Language,
    ctx: BotContext
): Promise<boolean> {
    const mentions = isGroup && effectiveSender ? [effectiveSender] : undefined;
    const cleanSenderPhone = extractPhoneNumber(effectiveSender);
    const senderTag = cleanSenderPhone ? `@${cleanSenderPhone}` : "Admin";

    // 0. Admin Panel Main Drawer / Fallback
    if (actionId === "admin_panel" || actionId === "btn_admin_panel") {
        const isMaint = ctx.state.isMaintenanceMode();
        if (ctx.sendList) {
            try {
                await ctx.sendList(remoteJid, buildAdminPanelMenu(_userLang, isMaint));
                return true;
            } catch (err) {
                console.warn("[Admin Panel] sendList failed (e.g. group error 479), falling back to quick reply buttons:", err);
            }
        }
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buildAdminPanelQuickReply(_userLang, isMaint));
        } else {
            const qr = buildAdminPanelQuickReply(_userLang, isMaint);
            await ctx.sendText(remoteJid, qr.text, mentions);
        }
        return true;
    }

    // 0.1 Admin Panel: Balance Summary & Refresh
    if (actionId === "admin_panel_balance" || actionId === "btn_admin_balance_refresh") {
        const forceRefresh = actionId === "btn_admin_balance_refresh";
        try {
            const res = await ctx.client.getBalance(forceRefresh);
            const gamertag = res.bot.gamertag;
            const tokens = res.bot.tokens;
            const costumeTokens = res.bot.costumeTokens ?? 0;
            const botStatus = res.bot.status === "ONLINE"
                ? t("admin.balanceOnline", _userLang)
                : t("admin.balanceOffline", _userLang);
            const s = res.summary;

            const out = t("admin.balanceSummary", _userLang, {
                gamertag,
                botStatus,
                tokens,
                costumeTokens,
                todayCompleted: s.todayCompleted,
                todayRevenue: formatRupiah(s.todayRevenue),
                pendingPayment: s.pendingPayment,
                giftingQueue: s.giftingQueue,
                insufficientTokens: s.insufficientTokens,
                discountPercent: s.discountPercent,
                activeVouchers: s.activeVouchers,
                storeUpper: config.STORE_NAME.toUpperCase()
            });

            const buttonsPayload = buildAdminBalanceButtons(out, _userLang);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttonsPayload);
            } else {
                await ctx.sendText(remoteJid, out, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("admin.balanceFailed", _userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    // 0.2 Admin Panel: Maintenance Mode Menu & Toggles
    if (actionId === "admin_panel_maintenance") {
        const isMaint = ctx.state.isMaintenanceMode();
        const maintPayload = buildAdminMaintenanceButtons(isMaint, _userLang);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, maintPayload);
        } else {
            await ctx.sendText(remoteJid, maintPayload.text, mentions);
        }
        return true;
    }

    if (actionId === "btn_admin_maint_on") {
        ctx.state.setMaintenanceMode(true);
        const notice = t("admin.maintenanceEnabled", _userLang, { store: config.STORE_NAME });
        await ctx.sendText(remoteJid, notice, mentions);
        const maintPayload = buildAdminMaintenanceButtons(true, _userLang);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, maintPayload);
        }
        return true;
    }

    if (actionId === "btn_admin_maint_off") {
        ctx.state.setMaintenanceMode(false);
        const notice = t("admin.maintenanceDisabled", _userLang, { store: config.STORE_NAME });
        await ctx.sendText(remoteJid, notice, mentions);
        const maintPayload = buildAdminMaintenanceButtons(false, _userLang);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, maintPayload);
        }
        return true;
    }

    // 0.3 Admin Panel: Catalog Sync
    if (actionId === "admin_panel_sync") {
        try {
            await ctx.client.syncCatalog();
            clearPosterCache();
            const successMsg = t("admin.syncSuccess", _userLang);
            const payload = buildQuickReplyPayload(successMsg, [
                { id: "btn_admin_panel", text: t("buttons.adminPanel", _userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, payload);
            } else {
                await ctx.sendText(remoteJid, successMsg, mentions);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const failMsg = t("admin.syncFailed", _userLang, { message: msg });
            await ctx.sendText(remoteJid, failMsg, mentions);
        }
        return true;
    }

    // 0.4 Admin Panel: Order Monitoring
    if (actionId === "admin_panel_orders") {
        try {
            const res = await ctx.client.getBalance(false);
            const s = res.summary;
            const text = `${t("interactive.adminOrdersTitle", _userLang)}\n\n` +
                `• Selesai Hari Ini: *${s.todayCompleted}* pesanan\n` +
                `• Menunggu Pembayaran: *${s.pendingPayment}* pesanan\n` +
                `• Antrean Gifting: *${s.giftingQueue}* pesanan\n` +
                `• Tertahan Token: *${s.insufficientTokens}* pesanan\n\n` +
                `💡 _Pesanan yang tertahan atau gagal dapat langsung diproses melalui tombol aksi pada grup log/admin._`;
            const payload = buildQuickReplyPayload(text, [
                { id: "btn_admin_panel", text: t("buttons.adminPanel", _userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, payload);
            } else {
                await ctx.sendText(remoteJid, text, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal memuat data pesanan: ${errMsg}`, mentions);
        }
        return true;
    }

    // 0.5 Admin Panel: Vouchers & Discount
    if (actionId === "admin_panel_vouchers") {
        try {
            const res = await ctx.client.getBalance(false);
            const s = res.summary;
            const text = `${t("interactive.adminVouchersTitle", _userLang)}\n\n` +
                `• Diskon Global Toko: *${s.discountPercent}%*\n` +
                `• Total Voucher Aktif: *${s.activeVouchers}* voucher\n\n` +
                `💡 _Diskon toko diterapkan langsung ke seluruh katalog item. Voucher tambahan dapat diklaim pembeli saat konfirmasi order._`;
            const payload = buildQuickReplyPayload(text, [
                { id: "btn_admin_panel", text: t("buttons.adminPanel", _userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, payload);
            } else {
                await ctx.sendText(remoteJid, text, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal memuat data voucher: ${errMsg}`, mentions);
        }
        return true;
    }

    // 1. Mark Paid
    if (actionId.startsWith("btn_admin_paid_") || actionId.startsWith("admin_paid_")) {
        const orderId = actionId.replace(/^(btn_)?admin_paid_/, "");
        try {
            const { buyerJid, itemName, gamertag, status } = await getOrderDetails(ctx, orderId);
            const upperStatus = (status || "").toUpperCase();

            if (upperStatus === "CANCELLED" || upperStatus === "EXPIRED") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* sudah berstatus *${status}*! Tidak dapat ditandai lunas.`,
                    mentions
                );
                return true;
            }

            if (upperStatus === "SUCCESS") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* sudah selesai (*SUCCESS*) sebelumnya! Tidak dapat ditandai lunas lagi.`,
                    mentions
                );
                return true;
            }

            if (upperStatus === "QUEUED" || upperStatus === "PROCESSING") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* sudah berstatus *${status}* (sedang diproses)!`,
                    mentions
                );
                return true;
            }

            if (typeof ctx.client.markOrderAsPaid === "function") {
                await ctx.client.markOrderAsPaid(orderId);
            } else if (typeof (ctx.client as any).markOrderPaid === "function") {
                await (ctx.client as any).markOrderPaid(orderId);
            }

            if (ctx.adminLogger) {
                await ctx.adminLogger.updateOrderStatus(orderId, "QUEUED", {
                    itemName,
                    gamertag,
                    platformUserId: buyerJid
                });
            }

            await ctx.sendText(
                remoteJid,
                t("admin.actionPaidSuccess", "id", { orderId, senderTag }),
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const lowerMsg = msg.toLowerCase();
            if (
                lowerMsg.includes("already") ||
                lowerMsg.includes("selesai") ||
                lowerMsg.includes("status") ||
                lowerMsg.includes("cancelled") ||
                lowerMsg.includes("expired")
            ) {
                await ctx.sendText(remoteJid, `⚠️ Gagal menandai lunas: ${msg}`, mentions);
            } else {
                const { buyerJid } = await getOrderDetails(ctx, orderId);
                await notifyFailureWithButtons(ctx, remoteJid, orderId, msg, mentions, buyerJid, "admin.actionPaidFailed");
            }
        }
        return true;
    }

    // 2. Manual Done / Completed
    if (actionId.startsWith("btn_admin_done_") || actionId.startsWith("admin_done_")) {
        const orderId = actionId.replace(/^(btn_)?admin_done_/, "");
        try {
            const { buyerJid, itemName, gamertag, status } = await getOrderDetails(ctx, orderId);
            const upperStatus = (status || "").toUpperCase();

            if (upperStatus === "CANCELLED" || upperStatus === "EXPIRED") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* sudah berstatus *${status}*! Tidak dapat diselesaikan secara manual.`,
                    mentions
                );
                return true;
            }

            if (upperStatus === "SUCCESS") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* sudah berstatus *SUCCESS* sebelumnya!`,
                    mentions
                );
                return true;
            }

            if (typeof ctx.client.manualCompleteOrder === "function") {
                await ctx.client.manualCompleteOrder(orderId);
            } else if (typeof (ctx.client as any).updateOrderStatus === "function") {
                await (ctx.client as any).updateOrderStatus(orderId, "COMPLETED");
            }

            if (ctx.adminLogger) {
                await ctx.adminLogger.updateOrderStatus(orderId, "SUCCESS", {
                    itemName,
                    gamertag,
                    platformUserId: buyerJid
                });
            }

            await ctx.sendText(
                remoteJid,
                t("admin.actionDoneSuccess", "id", { orderId, senderTag }),
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("admin.actionDoneFailed", "id", { orderId, error: msg }), mentions);
        }
        return true;
    }

    // 3. Reprocess / Retry Order
    if (actionId.startsWith("btn_admin_reprocess_") || actionId.startsWith("admin_reprocess_")) {
        const orderId = actionId.replace(/^(btn_)?admin_reprocess_/, "");
        try {
            const { buyerJid, itemName, gamertag, status } = await getOrderDetails(ctx, orderId);
            const upperStatus = (status || "").toUpperCase();

            if (upperStatus === "CANCELLED" || upperStatus === "EXPIRED") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* sudah berstatus *${status}*! Tidak dapat diproses ulang.`,
                    mentions
                );
                return true;
            }

            if (upperStatus === "SUCCESS") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* sudah berstatus *SUCCESS* (sudah selesai)!`,
                    mentions
                );
                return true;
            }

            if (upperStatus === "PENDING_PAYMENT") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* belum dibayar (*PENDING_PAYMENT*)! Tandai lunas terlebih dahulu sebelum reprocess.`,
                    mentions
                );
                return true;
            }

            if (typeof ctx.client.retryOrder === "function") {
                await ctx.client.retryOrder(orderId);
            } else if (typeof (ctx.client as any).reprocessOrder === "function") {
                await (ctx.client as any).reprocessOrder(orderId);
            }

            await ctx.sendText(
                remoteJid,
                t("admin.actionReprocessSuccess", "id", { orderId, senderTag }),
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const { buyerJid } = await getOrderDetails(ctx, orderId);
            await notifyFailureWithButtons(ctx, remoteJid, orderId, msg, mentions, buyerJid, "admin.actionReprocessFailed");
        }
        return true;
    }

    // 4. Cancel Order
    if (actionId.startsWith("btn_admin_cancel_") || actionId.startsWith("admin_cancel_")) {
        const orderId = actionId.replace(/^(btn_)?admin_cancel_/, "");
        try {
            const { status } = await getOrderDetails(ctx, orderId);
            const upperStatus = (status || "").toUpperCase();

            if (upperStatus === "CANCELLED") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* sudah dibatalkan sebelumnya.`,
                    mentions
                );
                return true;
            }

            if (upperStatus === "SUCCESS") {
                await ctx.sendText(
                    remoteJid,
                    `⚠️ Pesanan *#${orderId}* sudah selesai (*SUCCESS*) dan tidak dapat dibatalkan!`,
                    mentions
                );
                return true;
            }

            if (typeof ctx.client.cancelOrder === "function") {
                await ctx.client.cancelOrder(orderId, "Cancelled by admin via button");
            } else if (typeof (ctx.client as any).updateOrderStatus === "function") {
                await (ctx.client as any).updateOrderStatus(orderId, "REFUNDED");
            }

            await ctx.sendText(
                remoteJid,
                t("admin.actionCancelSuccess", "id", { orderId, senderTag }),
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("admin.actionCancelFailed", "id", { orderId, error: msg }), mentions);
        }
        return true;
    }

    // 5. Live Chat Solved
    if (actionId.startsWith("btn_admin_solved_") || actionId.startsWith("admin_solved_")) {
        const rawTarget = actionId.replace(/^(btn_)?admin_solved_/, "").trim();
        let matched = ctx.state.findLiveChatUser(rawTarget);

        if (!matched && rawTarget) {
            try {
                const cleanOrderId = rawTarget.replace(/^#/, "");
                const orderRes = await ctx.client.getOrderStatus(cleanOrderId);
                if (orderRes?.platformUserId) {
                    matched = { jid: orderRes.platformUserId, session: ctx.state.getSession(orderRes.platformUserId) };
                }
            } catch {
                // ignore
            }
        }

        if (!matched && !rawTarget) {
            const activeList = ctx.state.getAllActiveLiveChats();
            if (activeList.length === 1 && activeList[0]) {
                matched = { jid: activeList[0].jid, session: ctx.state.getSession(activeList[0].jid) };
            }
        }

        if (!matched) {
            await ctx.sendText(remoteJid, t("admin.ticketSolvedNotFound", "id", { target: rawTarget }), mentions);
            return true;
        }

        const targetJid = matched.jid;
        ctx.state.endLiveChat(targetJid);

        // Send closing message to customer
        const targetLang = ctx.state.getLanguage(targetJid);
        const buyerClosing = t("admin.solvedBuyerClosing", targetLang, { store: config.STORE_NAME });
        try {
            await ctx.sendText(targetJid, buyerClosing);
        } catch (err) {
            console.warn(`[adminAction] Failed to send closing text to ${targetJid}:`, err);
        }

        const cleanPhone = extractPhoneNumber(targetJid);
        await ctx.sendText(
            remoteJid,
            t("admin.ticketSolvedSummary", "id", { phone: cleanPhone, senderTag }),
            mentions
        );
        return true;
    }

    return false;
}
