import type { Command, CommandContext } from "../types";
import { formatRupiah, t } from "../../i18n";
import { parseOrderArgs, resolveTargetOrderId } from "../orderHelper";

export const paidCommand: Command = {
    name: "/paid",
    aliases: ["/acc", "/approve", "/bayar"],
    adminOnly: true,
    order: 25,
    category: "order",
    description: "Verifikasi pembayaran manual (default: order terakhir, -s tanpa notifikasi)",
    locales: {
        en: {
            name: "/paid",
            description: "Bypass manual payment verification (default: latest order, -s silent)"
        }
    },
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        const parsed = parseOrderArgs(args);

        // 1. Handle bulk payment verification for all pending payment orders
        if (parsed.isAll) {
            try {
                if (typeof ctx.client.markAllOrdersAsPaid !== "function") {
                    await ctx.sendText(remoteJid, t("admin.paidFailed", userLang, { orderId: "ALL", error: "Endpoint not supported" }));
                    return;
                }
                const res = await ctx.client.markAllOrdersAsPaid({ silent: parsed.isSilent });
                const key = parsed.isSilent ? "admin.paidAllSuccessSilent" : "admin.paidAllSuccess";
                await ctx.sendText(remoteJid, t(key, userLang, { count: res.count }));
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("admin.paidFailed", userLang, { orderId: "ALL", error: errMsg }));
            }
            return;
        }

        // 2. Resolve single target order (specific ID or latest pending order)
        const target = await resolveTargetOrderId(ctx.client, parsed, {
            preferredStatuses: ["PENDING_PAYMENT"]
        });

        if (!target) {
            await ctx.sendText(remoteJid, t("admin.paidUsage", userLang));
            return;
        }

        const targetId = target.orderId;

        try {
            const res = await ctx.client.markOrderAsPaid(targetId, { silent: parsed.isSilent });
            const key = parsed.isSilent ? "admin.paidSuccessSilent" : "admin.paidSuccess";
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
            await ctx.sendText(remoteJid, t("admin.paidFailed", userLang, { orderId: targetId, error: errMsg }));
        }
    },
};

export default paidCommand;
