import type { BotContext } from "./message";
import type { Language } from "../types";
import { config } from "../config";
import { t } from "../i18n";
import { extractPhoneNumber } from "../utils/messageUtils";

export async function handleAdminAction(
    remoteJid: string,
    actionId: string,
    effectiveSender: string,
    isGroup: boolean,
    userLang: Language,
    ctx: BotContext
): Promise<boolean> {
    const mentions = isGroup && effectiveSender ? [effectiveSender] : undefined;
    const cleanSenderPhone = extractPhoneNumber(effectiveSender);
    const senderTag = cleanSenderPhone ? `@${cleanSenderPhone}` : "Admin";

    // 1. Mark Paid + Auto Reprocess
    if (actionId.startsWith("btn_admin_paid_") || actionId.startsWith("admin_paid_")) {
        const orderId = actionId.replace(/^(btn_)?admin_paid_/, "");
        try {
            if (typeof ctx.client.markOrderAsPaid === "function") {
                await ctx.client.markOrderAsPaid(orderId);
            } else if (typeof (ctx.client as any).markOrderPaid === "function") {
                await (ctx.client as any).markOrderPaid(orderId);
            }

            // Retrieve order info to notify buyer
            let buyerJid = "";
            let itemName = "Item";
            let gamertag = "-";
            try {
                const orderInfo = await ctx.client.getOrderStatus(orderId);
                if (orderInfo) {
                    buyerJid = orderInfo.platformUserId || "";
                    itemName = orderInfo.itemName || itemName;
                    gamertag = orderInfo.gamertag || gamertag;
                }
            } catch {}

            // Notify buyer: payment verified & queued
            if (buyerJid) {
                const buyerLang = ctx.state.getLanguage(buyerJid);
                const isEn = buyerLang === "en";
                const buyerNotice = isEn
                    ? `✅ *PAYMENT RECEIVED & VERIFIED!* 🎉\n\nPayment for order *#${orderId}* (*${itemName}*) has been verified by Admin.\n\n⏳ Your order is now directly queued for delivery in The Hive Bedrock! 🚀`
                    : `✅ *PEMBAYARAN DITERIMA & DIVERIFIKASI!* 🎉\n\nPembayaran untuk pesanan *#${orderId}* (*${itemName}*) telah diverifikasi oleh Admin.\n\n⏳ Pesanan kakak sekarang langsung masuk ke antrean pengiriman The Hive Bedrock! Mohon ditunggu ya kak 🚀`;

                try {
                    await ctx.sendText(buyerJid, buyerNotice);
                } catch (notifyErr) {
                    console.warn(`[adminAction] Failed to notify buyer ${buyerJid} for paid #${orderId}:`, notifyErr);
                }
            }

            // Directly queue the order
            try {
                if (typeof ctx.client.retryOrder === "function") {
                    await ctx.client.retryOrder(orderId);
                } else if (typeof (ctx.client as any).reprocessOrder === "function") {
                    await (ctx.client as any).reprocessOrder(orderId);
                }

                await ctx.sendText(
                    remoteJid,
                    `✅ Pesanan *#${orderId}* berhasil ditandai *LUNAS* dan dikirim ke antrean pengiriman The Hive oleh ${senderTag}! 🚀`,
                    mentions
                );
            } catch (reErr: unknown) {
                const reErrMsg = reErr instanceof Error ? reErr.message : String(reErr);
                console.warn(`[adminAction] Auto-reprocess after paid failed for #${orderId}:`, reErrMsg);

                // Send failure alert in group with Retry button
                if (ctx.adminLogger) {
                    await ctx.adminLogger.updateOrderStatus(orderId, "FAILED", {
                        failureReason: reErrMsg,
                        itemName,
                        gamertag,
                        platformUserId: buyerJid
                    });
                }

                try {
                    const { buildAdminOrderFailureButtons } = await import("../utils/interactiveBuilders");
                    const failPayload = buildAdminOrderFailureButtons(orderId, reErrMsg, "id");
                    await ctx.sendText(remoteJid, `❌ Gagal memproses ke antrean The Hive untuk pesanan *#${orderId}*: ${reErrMsg}\n\n👉 Klik tombol di bawah untuk mencoba kembali:`, mentions);
                    if (ctx.sendButtons) {
                        await ctx.sendButtons(remoteJid, failPayload);
                    }
                } catch {}

                // Send follow-up error with Live Chat button to buyer
                if (buyerJid) {
                    const { buildUserOrderFailureButtons } = await import("../utils/interactiveBuilders");
                    const buyerLang = ctx.state.getLanguage(buyerJid);
                    const failBtns = buildUserOrderFailureButtons(orderId, reErrMsg, buyerLang);
                    if (ctx.sendButtons) {
                        await ctx.sendButtons(buyerJid, failBtns);
                    } else {
                        await ctx.sendText(buyerJid, failBtns.text);
                    }
                }
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            try {
                const { buildAdminOrderFailureButtons } = await import("../utils/interactiveBuilders");
                const failPayload = buildAdminOrderFailureButtons(orderId, msg, "id");
                await ctx.sendText(remoteJid, `❌ Gagal menandai lunas pesanan *#${orderId}*: ${msg}\n\n👉 Klik tombol di bawah untuk mencoba kembali:`, mentions);
                if (ctx.sendButtons) {
                    await ctx.sendButtons(remoteJid, failPayload);
                }
            } catch {
                await ctx.sendText(remoteJid, `❌ Gagal menandai lunas pesanan *#${orderId}*: ${msg}`, mentions);
            }

            try {
                const orderInfo = await ctx.client.getOrderStatus(orderId);
                if (orderInfo?.platformUserId) {
                    const buyerJid = orderInfo.platformUserId;
                    const buyerLang = ctx.state.getLanguage(buyerJid);
                    const { buildUserOrderFailureButtons } = await import("../utils/interactiveBuilders");
                    const userBtns = buildUserOrderFailureButtons(orderId, msg, buyerLang);
                    if (ctx.sendButtons) {
                        await ctx.sendButtons(buyerJid, userBtns);
                    } else {
                        await ctx.sendText(buyerJid, userBtns.text);
                    }
                }
            } catch {}
        }
        return true;
    }

    // 2. Manual Done / Completed
    if (actionId.startsWith("btn_admin_done_") || actionId.startsWith("admin_done_")) {
        const orderId = actionId.replace(/^(btn_)?admin_done_/, "");
        try {
            if (typeof ctx.client.manualCompleteOrder === "function") {
                await ctx.client.manualCompleteOrder(orderId);
            } else if (typeof (ctx.client as any).updateOrderStatus === "function") {
                await (ctx.client as any).updateOrderStatus(orderId, "COMPLETED");
            }

            // Retrieve order info to notify buyer
            let buyerJid = "";
            let itemName = "Item";
            let gamertag = "-";
            try {
                const orderInfo = await ctx.client.getOrderStatus(orderId);
                if (orderInfo) {
                    buyerJid = orderInfo.platformUserId || "";
                    itemName = orderInfo.itemName || itemName;
                    gamertag = orderInfo.gamertag || gamertag;
                }
            } catch {}

            // Update status in admin logger if present
            if (ctx.adminLogger) {
                await ctx.adminLogger.updateOrderStatus(orderId, "SUCCESS", {
                    itemName,
                    gamertag,
                    platformUserId: buyerJid
                });
            }

            // Notify buyer: order completed manually by admin
            if (buyerJid) {
                const buyerLang = ctx.state.getLanguage(buyerJid);
                const isEn = buyerLang === "en";
                const buyerNotice = isEn
                    ? `🎉 *ORDER COMPLETED!* ✨\n\nOrder *#${orderId}* (*${itemName}*) for Gamertag *${gamertag}* has been successfully completed by Admin! 📦\n\nThank you for shopping with ${config.STORE_NAME.toUpperCase()}! Enjoy your cosmetics! 🎮✨`
                    : `🎉 *PESANAN SELESAI!* ✨\n\nPesanan *#${orderId}* (*${itemName}*) untuk Gamertag *${gamertag}* telah berhasil diselesaikan oleh Admin! 📦\n\nTerima kasih banyak telah berbelanja di ${config.STORE_NAME.toUpperCase()} kak! Selamat menikmati kosmetik barunya! 🎮✨`;

                try {
                    await ctx.sendText(buyerJid, buyerNotice);
                } catch (notifyErr) {
                    console.warn(`[adminAction] Failed to notify buyer ${buyerJid} for completed #${orderId}:`, notifyErr);
                }
            }

            await ctx.sendText(
                remoteJid,
                `✅ Pesanan *#${orderId}* berhasil diselesaikan secara manual oleh ${senderTag}! 📦✨`,
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal menyelesaikan pesanan *#${orderId}*: ${msg}`, mentions);
        }
        return true;
    }

    // 3. Reprocess / Retry Order
    if (actionId.startsWith("btn_admin_reprocess_") || actionId.startsWith("admin_reprocess_")) {
        const orderId = actionId.replace(/^(btn_)?admin_reprocess_/, "");
        try {
            if (typeof ctx.client.retryOrder === "function") {
                await ctx.client.retryOrder(orderId);
            } else if (typeof (ctx.client as any).reprocessOrder === "function") {
                await (ctx.client as any).reprocessOrder(orderId);
            }

            await ctx.sendText(
                remoteJid,
                `🔄 Pesanan *#${orderId}* berhasil dikirim ulang ke antrean pengiriman The Hive oleh ${senderTag}! ⚡`,
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);

            // Follow-up failure message in group with Retry button
            try {
                const { buildAdminOrderFailureButtons } = await import("../utils/interactiveBuilders");
                const failPayload = buildAdminOrderFailureButtons(orderId, msg, "id");
                await ctx.sendText(remoteJid, `❌ Gagal memproses ulang pesanan *#${orderId}*: ${msg}\n\n👉 Klik tombol di bawah untuk mencoba kembali setelah server pulih:`, mentions);
                if (ctx.sendButtons) {
                    await ctx.sendButtons(remoteJid, failPayload);
                }
            } catch {}

            // Notify buyer with Live Chat button
            try {
                const orderInfo = await ctx.client.getOrderStatus(orderId);
                if (orderInfo?.platformUserId) {
                    const buyerJid = orderInfo.platformUserId;
                    const buyerLang = ctx.state.getLanguage(buyerJid);
                    const { buildUserOrderFailureButtons } = await import("../utils/interactiveBuilders");
                    const userBtns = buildUserOrderFailureButtons(orderId, msg, buyerLang);
                    if (ctx.sendButtons) {
                        await ctx.sendButtons(buyerJid, userBtns);
                    } else {
                        await ctx.sendText(buyerJid, userBtns.text);
                    }
                }
            } catch {}
        }
        return true;
    }

    // 4. Cancel Order
    if (actionId.startsWith("btn_admin_cancel_") || actionId.startsWith("admin_cancel_")) {
        const orderId = actionId.replace(/^(btn_)?admin_cancel_/, "");
        try {
            if (typeof ctx.client.cancelOrder === "function") {
                await ctx.client.cancelOrder(orderId, "Cancelled by admin via button");
            } else if (typeof (ctx.client as any).updateOrderStatus === "function") {
                await (ctx.client as any).updateOrderStatus(orderId, "REFUNDED");
            }

            await ctx.sendText(
                remoteJid,
                `🚫 Pesanan *#${orderId}* telah dibatalkan oleh ${senderTag}.`,
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal membatalkan pesanan *#${orderId}*: ${msg}`, mentions);
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
            await ctx.sendText(remoteJid, `⚠️ Tidak ditemukan sesi live chat aktif untuk *${rawTarget}*.`, mentions);
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
            `✅ *TIKET LIVE CHAT DISELESAIKAN*\n• Pelanggan: *+${cleanPhone}*\n• Ditangani oleh: ${senderTag}\n• Status: *Bot Aktif Kembali ✅*`,
            mentions
        );
        return true;
    }

    return false;
}
