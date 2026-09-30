import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { formatRupiah, formatStatusBadge, t } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";

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
    execute: async ({ remoteJid, sender, isGroup, userLang, ctx }: CommandContext) => {
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

            const recent = orders.slice(0, 5);
            let out = `${prefix}${t("history.title", userLang, { store: config.STORE_NAME })}`;

            recent.forEach((ord, idx) => {
                const badge = formatStatusBadge(ord.status, userLang, ord.failureReason);
                out += `${idx + 1}. *#${ord.id}* — ${badge}\n`;
                out += `   📦 ${ord.itemName} (${ord.gamertag})\n`;
                out += `   💰 ${formatRupiah(ord.totalNominal)}\n\n`;
            });

            out += t("history.footer", userLang);
            await ctx.sendText(remoteJid, out, mentions);
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
