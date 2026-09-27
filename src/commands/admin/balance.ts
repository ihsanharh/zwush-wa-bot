import type { Command, CommandContext } from "../types";
import { formatRupiah, t } from "../../i18n";
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
                ? t("admin.balanceOnline", userLang)
                : t("admin.balanceOffline", userLang);
            const s = res.summary;

            const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
            const mentionPrefix = senderPhone ? `@${senderPhone}\n\n` : "";

            const out = mentionPrefix + t("admin.balanceSummary", userLang, {
                gamertag,
                botStatus,
                tokens,
                todayCompleted: s.todayCompleted,
                todayRevenue: formatRupiah(s.todayRevenue),
                pendingPayment: s.pendingPayment,
                giftingQueue: s.giftingQueue,
                insufficientTokens: s.insufficientTokens,
                discountPercent: s.discountPercent,
                activeVouchers: s.activeVouchers
            });

            await ctx.sendText(remoteJid, out, isGroup && sender ? [sender] : undefined);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal mengambil status saldo: ${errMsg}`);
        }
    },
};

export default balanceCommand;
