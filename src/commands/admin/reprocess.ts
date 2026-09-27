import type { Command, CommandContext } from "../types";
import { t } from "../../i18n";

export const reprocessCommand: Command = {
    name: "/reprocess",
    aliases: ["/retry"],
    adminOnly: true,
    description: "Proses ulang pesanan yang tertahan stok token",
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        if (args.length === 0) {
            try {
                const res = await ctx.client.retryAllOrders();
                const list = res.orderIds.length > 0
                    ? res.orderIds.map((id) => `• #${id}`).join("\n")
                    : t("admin.reprocessNoneHeld", userLang);
                await ctx.sendText(
                    remoteJid,
                    t("admin.reprocessAllSuccess", userLang, {
                        count: res.count,
                        list
                    })
                );
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("admin.reprocessFailed", userLang, { error: errMsg }));
            }
        } else {
            const targetId = (args[0] || "").replace(/^#/, "");
            try {
                const res = await ctx.client.retryOrder(targetId);
                await ctx.sendText(
                    remoteJid,
                    t("admin.reprocessSingleSuccess", userLang, { orderId: res.orderId })
                );
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("admin.reprocessFailed", userLang, { error: errMsg }));
            }
        }
    },
};

export default reprocessCommand;

