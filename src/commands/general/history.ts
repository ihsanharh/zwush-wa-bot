import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { t } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { buildOrderHistoryButtons } from "../../utils/interactiveBuilders";

export const historyCommand: Command = {
    name: "/riwayat",
    aliases: ["/history"],
    order: 40,
    category: "general",
    description: "Lihat daftar riwayat pesanan kakak",
    locales: {
        en: {
            name: "/history",
            description: "View your order history list"
        }
    },
    execute: async ({ remoteJid, sender, isGroup, userLang, ctx, args }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;

        try {
            const targetUser = isGroup ? sender : remoteJid;
            const orders = await ctx.client.getUserOrders(targetUser);
            if (!orders || orders.length === 0) {
                await ctx.sendText(remoteJid, `${prefix}${t("history.empty", userLang)}`, mentions);
                return;
            }

            const requestedPage = args && args[0] ? parseInt(args[0], 10) : 1;
            const page = isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage;

            if (ctx.sendButtons) {
                const historyPayload = buildOrderHistoryButtons(orders, page, 5, userLang);
                if (prefix) {
                    historyPayload.interactiveMessage.body.text = prefix + historyPayload.interactiveMessage.body.text;
                    historyPayload.text = prefix + historyPayload.text;
                }
                await ctx.sendButtons(remoteJid, historyPayload);
            } else {
                const historyPayload = buildOrderHistoryButtons(orders, page, 5, userLang);
                await ctx.sendText(remoteJid, prefix + historyPayload.text, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(
                remoteJid,
                prefix + t("history.fetchError", userLang, { error: errMsg }),
                mentions
            );
        }
    },
};

export default historyCommand;
