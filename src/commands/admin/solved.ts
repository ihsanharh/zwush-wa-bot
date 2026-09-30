import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t } from "../../i18n";

export const solvedCommand: Command = {
    name: "/solved",
    aliases: ["/solve"],
    adminOnly: true,
    order: 60,
    category: "support",
    description: "Selesaikan sesi live chat support & aktifkan bot kembali",
    locales: {
        en: {
            name: "/solved",
            description: "Resolve live chat session & re-enable automated bot"
        }
    },
    execute: async ({ remoteJid, args, isGroup, sender, userLang, ctx }: CommandContext) => {
        const rawTarget = args.join(" ").trim();

        // 1. Try finding live chat user in state
        let matched = ctx.state.findLiveChatUser(rawTarget);

        // 2. If not found in memory by direct match, and rawTarget is an order ID, try looking up order in coreClient
        if (!matched && rawTarget) {
            try {
                const cleanOrderId = rawTarget.replace(/^#/, "");
                const orderRes = await ctx.client.getOrderStatus(cleanOrderId);
                const platformUserId = orderRes?.platformUserId;
                if (platformUserId) {
                    const session = ctx.state.getSession(platformUserId);
                    if (session.step === "LIVE_CHAT") {
                        matched = { jid: platformUserId, session };
                    }
                }
            } catch {
                // ignore
            }
        }

        // 3. If still not matched and no arguments were provided:
        if (!matched && !rawTarget) {
            const activeList = ctx.state.getAllActiveLiveChats();
            if (activeList.length === 1 && activeList[0]) {
                const onlyOne = activeList[0];
                matched = { jid: onlyOne.jid, session: ctx.state.getSession(onlyOne.jid) };
            } else if (activeList.length > 1) {
                let list = "";
                activeList.forEach((item, idx) => {
                    const phone = extractPhoneNumber(item.jid);
                    list += `${idx + 1}. +${phone} ${item.orderId ? `(Order #${item.orderId})` : ""}\n`;
                });
                const listMsg = t("admin.solvedActiveList", userLang, {
                    count: activeList.length,
                    list: list.trim()
                });
                await ctx.sendText(remoteJid, listMsg, isGroup && sender ? [sender] : undefined);
                return;
            }
        }

        if (!matched) {
            const notFoundMsg = rawTarget
                ? t("admin.solvedNotFound", userLang, { target: rawTarget })
                : t("admin.solvedNoneActive", userLang);
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
        const userClosing = t("admin.solvedBuyerClosing", targetLang, { store: config.STORE_NAME });
        try {
            await ctx.sendText(targetJid, userClosing);
        } catch (err: unknown) {
            console.warn(`[solvedCommand] Failed to send closing text to user ${targetJid}:`, err);
        }

        // Reply in admin chat
        const orderIdLine = resolvedOrderId ? `• Order ID: *#${resolvedOrderId}*\n` : "";
        const adminReply = t("admin.solvedAdminReply", userLang, {
            orderIdLine,
            targetPhone
        });
        await ctx.sendText(remoteJid, adminReply, isGroup && sender ? [sender] : undefined);
    },
};

export default solvedCommand;
