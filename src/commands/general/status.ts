import type { Command, CommandContext } from "../types";
import { formatStatusText } from "../../utils/formatters";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t } from "../../i18n";

export const statusCommand: Command = {
    name: "/status",
    description: "Cek status pesanan terbaru atau berdasarkan ID",
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
                    prefix + (userLang === "en"
                        ? `❌ Failed to fetch order status: ${errMsg}\n\n💡 Please wait a moment and try again.`
                        : `❌ Gagal mengambil status pesanan kak: ${errMsg}\n\n💡 Mohon tunggu beberapa saat dan coba lagi ya kak.`),
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
                prefix + (userLang === "en"
                    ? `❌ Could not find order #${orderId}: ${errMsg}\n\n💡 Please check the order ID or try again in a moment.`
                    : `❌ Tidak dapat menemukan pesanan #${orderId} nih kak: ${errMsg}\n\n💡 Mohon pastikan ID pesanan benar atau coba beberapa saat lagi ya kak.`),
                mentions
            );
        }
    },
};

export default statusCommand;
