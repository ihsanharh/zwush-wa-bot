import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { formatRupiah, formatStatusBadge } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const historyCommand: Command = {
    name: "/riwayat",
    aliases: ["/history"],
    description: "Lihat riwayat pesanan kosmetik kakak",
    execute: async ({ remoteJid, sender, isGroup, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;

        try {
            const targetUser = isGroup ? sender : remoteJid;
            const orders = await ctx.client.getUserOrders(targetUser);
            if (!orders || orders.length === 0) {
                const emptyMsg = userLang === "en"
                    ? `${prefix}Hi there! You don't have any order history yet 😊\n\nStart shopping by typing */buy*!`
                    : `${prefix}Halo kak! Belum ada riwayat pesanan untuk nomor ini nih 😊\n\nYuk mulai belanja dengan ketik */beli* ya!`;
                await ctx.sendText(remoteJid, emptyMsg, mentions);
                return;
            }

            const recent = orders.slice(0, 5);
            let out = userLang === "en"
                ? `${prefix}📜 *ORDER HISTORY*\nRecent orders in ${config.STORE_NAME}:\n\n`
                : `${prefix}📜 *RIWAYAT PESANAN KAKAK*\nDaftar pesanan terbaru di ${config.STORE_NAME}:\n\n`;

            recent.forEach((ord, idx) => {
                const badge = formatStatusBadge(ord.status, userLang, ord.failureReason);
                out += `${idx + 1}. *#${ord.id}* — ${badge}\n`;
                out += `   📦 ${ord.itemName} (${ord.gamertag})\n`;
                out += `   💰 ${formatRupiah(ord.totalNominal)}\n\n`;
            });

            out += userLang === "en"
                ? `💡 _Type */status <ID>* to check details of a specific order._`
                : `💡 _Ketik */status <ID>* untuk melihat detail status pesanan tertentu._`;

            await ctx.sendText(remoteJid, out, mentions);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(
                remoteJid,
                prefix + (userLang === "en"
                    ? `❌ Failed to fetch order history: ${errMsg}\n\n💡 Please wait a moment and try again.`
                    : `❌ Gagal mengambil riwayat pesanan kak: ${errMsg}\n\n💡 Mohon tunggu beberapa saat dan coba lagi ya kak.`),
                mentions
            );
        }
    },
};

export default historyCommand;
