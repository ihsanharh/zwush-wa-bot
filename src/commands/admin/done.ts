import type { Command, CommandContext } from "../types";
import { formatRupiah, t } from "../../i18n";
import { parseOrderArgs, resolveTargetOrderId } from "../orderHelper";

export const doneCommand: Command = {
    name: "/done",
    aliases: ["/selesai", "/manualdone"],
    adminOnly: true,
    order: 20,
    category: "order",
    description: "Selesaikan order manual (default: order terakhir, -s tanpa notifikasi)",
    locales: {
        en: {
            name: "/done",
            description: "Complete order manually (default: latest order, -s silent)"
        }
    },
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        const parsed = parseOrderArgs(args);

        // 1. Handle bulk completion for all open/failed orders
        if (parsed.isAll) {
            try {
                if (typeof ctx.client.manualCompleteAllOrders !== "function") {
                    await ctx.sendText(remoteJid, t("admin.doneFailed", userLang, { orderId: "ALL", error: "Endpoint not supported" }));
                    return;
                }
                const res = await ctx.client.manualCompleteAllOrders({ silent: parsed.isSilent });
                const key = parsed.isSilent ? "admin.doneAllSuccessSilent" : "admin.doneAllSuccess";
                await ctx.sendText(remoteJid, t(key, userLang, { count: res.count }));
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("admin.doneFailed", userLang, { orderId: "ALL", error: errMsg }));
            }
            return;
        }

        // 2. Resolve single target order (specific ID or latest unfinished order)
        const target = await resolveTargetOrderId(ctx.client, parsed, {
            preferredStatuses: ["FAILED", "INSUFFICIENT_TOKENS", "PENDING_PAYMENT", "QUEUED"]
        });

        if (!target) {
            await ctx.sendText(remoteJid, t("admin.doneUsage", userLang));
            return;
        }

        const targetId = target.orderId;

        try {
            const res = await ctx.client.manualCompleteOrder(targetId, { silent: parsed.isSilent });
            const key = parsed.isSilent ? "admin.doneSuccessSilent" : "admin.doneSuccess";
            await ctx.sendText(
                remoteJid,
                t(key, userLang, {
                    orderId: res.orderId,
                    gamertag: res.gamertag,
                    itemName: res.itemName,
                    totalFormatted: formatRupiah(res.totalNominal)
                })
            );
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("admin.doneFailed", userLang, { orderId: targetId, error: errMsg }));
        }
    },
};

export default doneCommand;
