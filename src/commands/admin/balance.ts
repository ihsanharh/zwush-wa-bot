import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { formatRupiah } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const balanceCommand: Command = {
    name: "/saldo",
    aliases: ["/balance"],
    adminOnly: true,
    description: "Cek saldo token bot The Hive & omset hari ini",
    execute: async ({ remoteJid, args, isGroup, sender, userLang, ctx }: CommandContext) => {
        try {
            const forceRefresh = args.includes("--refresh") || args.includes("-r");
            const res = await ctx.client.getBalance(forceRefresh);

            const gamertag = res.bot.gamertag;
            const tokens = res.bot.tokens;
            const botStatus = res.bot.status === "ONLINE"
                ? (userLang === "en" ? "ONLINE / READY" : "ONLINE / SIAP")
                : res.bot.status;
            const s = res.summary;

            const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
            const mentionPrefix = senderPhone ? `@${senderPhone}\n\n` : "";

            if (userLang === "en") {
                const out =
                    `${mentionPrefix}💰 *BOT BALANCE & STORE STATUS — ${config.STORE_NAME.toUpperCase()}*\n\n` +
                    `🤖 *The Hive Bot Status:*\n` +
                    `• Gamertag: *${gamertag}*\n` +
                    `• Status: *${botStatus}* ✅\n` +
                    `• Remaining Gift Tokens: *${tokens} Token(s)* 🎁\n\n` +
                    `📊 *Today's Sales Summary:*\n` +
                    `• Completed Orders: *${s.todayCompleted} Orders*\n` +
                    `• Total Revenue: *${formatRupiah(s.todayRevenue)}*\n` +
                    `• Pending Payment: *${s.pendingPayment} Orders*\n` +
                    `• Gifting Queue: *${s.giftingQueue} Orders*\n` +
                    `• Token Deficit (Stuck): *${s.insufficientTokens} Orders*\n` +
                    `• Active Store Discount: *${s.discountPercent}%*\n` +
                    `• Active Vouchers: *${s.activeVouchers} Codes*\n\n` +
                    `💡 _Use /reprocess if any orders are stuck due to token deficit._`;
                await ctx.sendText(remoteJid, out, isGroup && sender ? [sender] : undefined);
                return;
            }

            const out =
                `${mentionPrefix}💰 *SALDO & STATUS BOT — ${config.STORE_NAME.toUpperCase()}*\n\n` +
                `🤖 *Status Bot The Hive:*\n` +
                `• Gamertag: *${gamertag}*\n` +
                `• Status: *${botStatus}* ✅\n` +
                `• Sisa Token Gift: *${tokens} Token* 🎁\n\n` +
                `📊 *Ringkasan Penjualan Hari Ini:*\n` +
                `• Pesanan Selesai: *${s.todayCompleted} Pesanan*\n` +
                `• Total Omset: *${formatRupiah(s.todayRevenue)}*\n` +
                `• Menunggu Pembayaran: *${s.pendingPayment} Pesanan*\n` +
                `• Antrean Gifting: *${s.giftingQueue} Pesanan*\n` +
                `• Tertahan Stok Token: *${s.insufficientTokens} Pesanan*\n` +
                `• Diskon Toko Aktif: *${s.discountPercent}%*\n` +
                `• Voucher Aktif: *${s.activeVouchers} Kode*\n\n` +
                `💡 _Gunakan /reprocess jika ada pesanan tertahan token._`;
            await ctx.sendText(remoteJid, out, isGroup && sender ? [sender] : undefined);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal mengambil data saldo & status bot: ${errMsg}`);
        }
    },
};

export default balanceCommand;
