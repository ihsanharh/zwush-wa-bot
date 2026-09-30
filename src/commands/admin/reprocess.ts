import type { Command, CommandContext } from "../types";
import { t } from "../../i18n";
import { parseOrderArgs, resolveTargetOrderId } from "../orderHelper";

export const reprocessCommand: Command = {
    name: "/reprocess",
    aliases: ["/retry"],
    adminOnly: true,
    order: 30,
    category: "order",
    description: "Proses ulang pesanan tertahan token (default: order terakhir, -s tanpa notifikasi)",
    locales: {
        en: {
            name: "/reprocess",
            description: "Reprocess token-deficit orders (default: latest order, -s silent)"
        }
    },
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        const parsed = parseOrderArgs(args);

        // 1. If explicit "all" keyword was passed
        if (parsed.isAll) {
            try {
                const res = await ctx.client.retryAllOrders({ silent: parsed.isSilent });
                const list = res.orderIds.length > 0
                    ? res.orderIds.map((id) => `• #${id}`).join("\n")
                    : t("admin.reprocessNoneHeld", userLang);
                const key = parsed.isSilent ? "admin.reprocessAllSuccessSilent" : "admin.reprocessAllSuccess";
                await ctx.sendText(
                    remoteJid,
                    t(key, userLang, {
                        count: res.count,
                        list
                    })
                );
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("admin.reprocessFailed", userLang, { error: errMsg }));
            }
            return;
        }

        // 2. If specific order ID or latest held/failed order can be resolved
        const target = await resolveTargetOrderId(ctx.client, parsed, {
            preferredStatuses: ["INSUFFICIENT_TOKENS", "FAILED"]
        });

        if (target) {
            const targetId = target.orderId;
            try {
                const res = await ctx.client.retryOrder(targetId, { silent: parsed.isSilent });
                const key = parsed.isSilent ? "admin.reprocessSingleSuccessSilent" : "admin.reprocessSingleSuccess";
                await ctx.sendText(
                    remoteJid,
                    t(key, userLang, { orderId: res.orderId })
                );
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("admin.reprocessFailed", userLang, { error: errMsg }));
            }
            return;
        }

        // 3. Fallback when no arguments given and no latest failed order found in DB: retry all held orders
        try {
            const res = await ctx.client.retryAllOrders({ silent: parsed.isSilent });
            const list = res.orderIds.length > 0
                ? res.orderIds.map((id) => `• #${id}`).join("\n")
                : t("admin.reprocessNoneHeld", userLang);
            const key = parsed.isSilent ? "admin.reprocessAllSuccessSilent" : "admin.reprocessAllSuccess";
            await ctx.sendText(
                remoteJid,
                t(key, userLang, {
                    count: res.count,
                    list
                })
            );
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("admin.reprocessFailed", userLang, { error: errMsg }));
        }
    },
};

export default reprocessCommand;
