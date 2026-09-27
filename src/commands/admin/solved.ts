import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const solvedCommand: Command = {
    name: "/solved",
    aliases: ["/solve"],
    adminOnly: true,
    description: "Selesaikan tiket live chat support dan aktifkan kembali bot untuk pelanggan",
    execute: async ({ remoteJid, args, isGroup, sender, ctx }: CommandContext) => {
        const rawTarget = args.join(" ").trim();

        // 1. Try finding live chat user in state
        let matched = ctx.state.findLiveChatUser(rawTarget);

        // 2. If not found in memory by direct match, and rawTarget is an order ID, try looking up order in coreClient
        if (!matched && rawTarget) {
            try {
                const cleanOrderId = rawTarget.replace(/^#/, "");
                const orderRes = await ctx.client.getOrderStatus(cleanOrderId);
                if (orderRes && orderRes.order && orderRes.order.platformUserId) {
                    const session = ctx.state.getSession(orderRes.order.platformUserId);
                    if (session.step === "LIVE_CHAT") {
                        matched = { jid: orderRes.order.platformUserId, session };
                    }
                }
            } catch {
                // ignore
            }
        }

        // 3. If still not matched and no arguments were provided:
        if (!matched && !rawTarget) {
            const activeList = ctx.state.getAllActiveLiveChats();
            if (activeList.length === 1) {
                const onlyOne = activeList[0];
                matched = { jid: onlyOne.jid, session: ctx.state.getSession(onlyOne.jid) };
            } else if (activeList.length > 1) {
                let listMsg = `⚠️ Ada *${activeList.length} sesi live chat* yang sedang aktif:\n\n`;
                activeList.forEach((item, idx) => {
                    const phone = extractPhoneNumber(item.jid);
                    listMsg += `${idx + 1}. +${phone} ${item.orderId ? `(Order #${item.orderId})` : ""}\n`;
                });
                listMsg += `\n💡 _Gunakan: */solved <order-id>* atau */solved <nomor>_`;
                await ctx.sendText(remoteJid, listMsg, isGroup && sender ? [sender] : undefined);
                return;
            }
        }

        if (!matched) {
            const notFoundMsg = rawTarget
                ? `⚠️ Tidak ditemukan sesi live chat aktif untuk *${rawTarget}*. Pastikan ID pesanan atau nomor pelanggan benar.`
                : `⚠️ Tidak ada sesi live chat yang sedang aktif saat ini.`;
            await ctx.sendText(remoteJid, notFoundMsg, isGroup && sender ? [sender] : undefined);
            return;
        }

        const targetJid = matched.jid;
        const targetSession = matched.session;
        const resolvedOrderId = targetSession.liveChatOrderId || targetSession.retryOrder?.orderId || targetSession.lastFailedOrder?.orderId || rawTarget.replace(/^#/, "");
        const targetPhone = extractPhoneNumber(targetJid);
        const targetLang = ctx.state.getLanguage(targetJid);

        // End live chat session
        ctx.state.endLiveChat(targetJid);

        // Send closing message to the user in DM
        const userClosing = targetLang === "en" ? (
            `✅ *SUPPORT SESSION RESOLVED*\n\n` +
            `Thank you for contacting ${config.STORE_NAME} support! The admin live chat session has been closed, and our bot is now back online for you.\n\n` +
            `Type */katalog* to browse our catalog or */help* for command list 😊`
        ) : (
            `✅ *SESI BANTUAN SELESAI*\n\n` +
            `Terima kasih telah menghubungi customer support ${config.STORE_NAME}! Sesi live chat bersama admin telah selesai, dan bot kami kini telah aktif kembali.\n\n` +
            `Ketik */katalog* untuk melihat koleksi item kami atau */bantuan* untuk daftar perintah ya kak 😊`
        );
        try {
            await ctx.sendText(targetJid, userClosing);
        } catch (err: unknown) {
            console.warn(`[solvedCommand] Failed to send closing text to user ${targetJid}:`, err);
        }

        // Reply in admin chat
        const adminReply =
            `✅ *TIKET LIVE CHAT BERHASIL DISELESAIKAN*\n\n` +
            (resolvedOrderId ? `• Order ID: *#${resolvedOrderId}*\n` : "") +
            `• Pelanggan: *+${targetPhone}*\n` +
            `• Status: *Bot Aktif Kembali ✅*\n\n` +
            `Pesan penutup telah dikirimkan ke pelanggan. Terima kasih!`;
        await ctx.sendText(remoteJid, adminReply, isGroup && sender ? [sender] : undefined);
    },
};

export default solvedCommand;
