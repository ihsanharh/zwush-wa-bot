import type { Command, CommandContext } from "../types";
import { formatRupiah } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t } from "../../i18n";
import { normalizeOrderId } from "../orderHelper";

export const checkPaymentCommand: Command = {
    name: "/cek",
    aliases: ["/check", "/cekbayar", "cek", "check"],
    order: 35,
    category: "general",
    description: "Cek verifikasi pembayaran GoPay/QRIS otomatis jika tertunda",
    locales: {
        en: {
            name: "/check",
            description: "Check GoPay/QRIS payment verification if delayed"
        }
    },
    execute: async ({ remoteJid, sender, isGroup, args, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;

        let targetOrderId = args[0] ? normalizeOrderId(args[0]) : "";

        try {
            if (!targetOrderId) {
                const targetUser = isGroup ? sender : remoteJid;
                const orders = await ctx.client.getUserOrders(targetUser);

                // Find active pending order first
                const pendingOrder = orders?.find((o) => o.status === "PENDING_PAYMENT");

                if (!pendingOrder) {
                    await ctx.sendText(remoteJid, `${prefix}${t("checkPayment.noActiveOrder", userLang)}`, mentions);
                    return;
                }

                targetOrderId = pendingOrder.id;
            }

            const res = await ctx.client.checkOrderPayment(targetOrderId);

            if (!res.success) {
                if (res.code === "COOLDOWN") {
                    await ctx.sendText(
                        remoteJid,
                        prefix + t("checkPayment.cooldown", userLang, {
                            seconds: res.remainingSeconds ?? 30,
                            orderId: targetOrderId,
                        }),
                        mentions
                    );
                    return;
                }

                if (res.code === "ORDER_NOT_PAYABLE") {
                    await ctx.sendText(
                        remoteJid,
                        prefix + t("checkPayment.expired", userLang, { orderId: targetOrderId }),
                        mentions
                    );
                    return;
                }

                if (res.code === "NOT_FOUND") {
                    await ctx.sendText(
                        remoteJid,
                        prefix + t("checkPayment.notFound", userLang, { orderId: targetOrderId }),
                        mentions
                    );
                    return;
                }

                await ctx.sendText(
                    remoteJid,
                    prefix + t("checkPayment.error", userLang, { error: res.message || "Unknown error" }),
                    mentions
                );
                return;
            }

            if (res.alreadyProcessed) {
                await ctx.sendText(
                    remoteJid,
                    prefix + t("checkPayment.alreadyPaid", userLang, {
                        orderId: targetOrderId,
                        status: res.order?.status || "QUEUED",
                    }),
                    mentions
                );
                return;
            }

            if (res.verified) {
                await ctx.sendText(
                    remoteJid,
                    prefix + t("checkPayment.success", userLang, {
                        orderId: targetOrderId,
                        itemName: res.order?.itemName || "",
                        formattedAmount: formatRupiah(res.order?.totalNominal || 0),
                    }),
                    mentions
                );
                return;
            }

            // Not verified yet
            await ctx.sendText(
                remoteJid,
                prefix + t("checkPayment.pending", userLang, {
                    orderId: targetOrderId,
                    formattedAmount: formatRupiah(res.order?.totalNominal || 0),
                }),
                mentions
            );
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(
                remoteJid,
                prefix + t("checkPayment.error", userLang, { error: errMsg }),
                mentions
            );
        }
    },
};

export default checkPaymentCommand;
