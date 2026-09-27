import type { Command, CommandContext } from "../types";
import { formatStatusText } from "../../utils/formatters";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t } from "../../i18n";

export const statusCommand: Command = {
    name: "/status",
    englishName: "/status",
    order: 30,
    description: "Cek status pesanan terbaru atau berdasarkan ID",
    descriptionEn: "Check your active order status (or /status <ID>)",
    execute: async ({ remoteJid, sender, isGroup, args, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;

        const orderId = args[0];
        if (!orderId) {
            try {
                const targetUser = isGroup ? sender : remoteJid;
                const orders = await ctx.client.getUserOrders(targetUser);
                if (!orders || orders.length === 0) {
                    await ctx.sendText(remoteJid, `${prefix}${t("emptyOrders", userLang)}`, mentions);
                    return;
                }

                // Find active or latest order
                const activeOrder = orders.find(
                    (o) =>
                        o.status === "PENDING_PAYMENT" ||
                        o.status === "QUEUED" ||
                        o.status === "GIFTING" ||
                        o.status === "INSUFFICIENT_TOKENS"
                ) ?? orders[0];

                if (!activeOrder) {
                    return;
                }

                await ctx.sendText(remoteJid, `${prefix}${formatStatusText(activeOrder, userLang)}`, mentions);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(
                    remoteJid,
                    prefix + t("status.fetchError", userLang, { error: errMsg }),
                    mentions
                );
            }
            return;
        }

        try {
            const cleanId = orderId.replace(/^#/, "");
            const order = await ctx.client.getOrderStatus(cleanId);
            await ctx.sendText(remoteJid, `${prefix}${formatStatusText(order, userLang)}`, mentions);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(
                remoteJid,
                prefix + t("status.notFound", userLang, { orderId, error: errMsg }),
                mentions
            );
        }
    },
};

export default statusCommand;
