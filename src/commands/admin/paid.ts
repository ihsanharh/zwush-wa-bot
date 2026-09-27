import type { Command, CommandContext } from "../types";
import { formatRupiah, t } from "../../i18n";

export const paidCommand: Command = {
    name: "/paid",
    aliases: ["/acc", "/approve", "/bayar"],
    adminOnly: true,
    description: "Verifikasi manual pembayaran order & masukkan ke antrean gifting",
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        if (args.length === 0) {
            await ctx.sendText(remoteJid, t("admin.paidUsage", userLang));
            return;
        }

        let targetId = (args[0] || "").trim().toUpperCase().replace(/^#/, "");
        if (!targetId.startsWith("ORD-")) {
            targetId = "ORD-" + targetId;
        }

        try {
            const res = await ctx.client.markOrderAsPaid(targetId);
            await ctx.sendText(
                remoteJid,
                t("admin.paidSuccess", userLang, {
                    orderId: res.orderId,
                    gamertag: res.gamertag,
                    itemName: res.itemName,
                    totalFormatted: formatRupiah(res.totalNominal)
                })
            );
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("admin.paidFailed", userLang, { orderId: targetId, error: errMsg }));
        }
    },
};

export default paidCommand;
