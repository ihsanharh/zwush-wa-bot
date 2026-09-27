import type { Command, CommandContext } from "../types";
import { formatRupiah, t } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const balanceCommand: Command = {
    name: "/saldo",
    aliases: ["/balance"],
    adminOnly: true,
    englishName: "/balance",
    order: 20,
    description: "Cek saldo token bot The Hive & omset hari ini",
    descriptionEn: "Check The Hive bot token balance & today's sales summary",
    execute: async ({ remoteJid, args, isGroup, sender, userLang, ctx }: CommandContext) => {
        try {
            const forceRefresh = args.length > 0 && args.some((a) =>
                ["refresh", "force", "sync", "-r", "--refresh", "-f", "--force", "f", "r", "update"].includes(a.toLowerCase())
            );

            if (forceRefresh) {
                const notifyMsg = t("admin.balanceFetching", userLang);
                await ctx.sendText(remoteJid, notifyMsg);
            }

            const res = await ctx.client.getBalance(forceRefresh);

            const gamertag = res.bot.gamertag;
            const tokens = res.bot.tokens;
            const costumeTokens = res.bot.costumeTokens ?? 0;
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
                costumeTokens,
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
            await ctx.sendText(remoteJid, t("admin.balanceFailed", userLang, { error: errMsg }));
        }
    },
};

export default balanceCommand;
