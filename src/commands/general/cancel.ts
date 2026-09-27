import type { Command, CommandContext } from "../types";
import { formatRupiah, t } from "../../i18n";

export const cancelCommand: Command = {
    name: "/batal",
    aliases: ["/cancel"],
    description: "Batalkan sesi pemesanan aktif atau pesanan pending",
    execute: async ({ remoteJid, args, isAdmin, userLang, ctx }: CommandContext) => {
        const session = ctx.state.getSession(remoteJid);

        // Case 1: An order ID is explicitly provided (e.g. /cancel ORD-123456) -> Admin only
        if (args.length > 0) {
            if (!isAdmin) {
                await ctx.sendText(remoteJid, t("admin.adminOnly", userLang));
                return;
            }

            let targetId = args[0].trim().toUpperCase().replace(/^#/, "");
            if (!targetId.startsWith("ORD-")) {
                targetId = "ORD-" + targetId;
            }

            try {
                const res = await ctx.client.cancelOrder(targetId, "Cancelled by admin via command");
                if (ctx.adminLogger) {
                    await ctx.adminLogger.updateOrderStatus(res.orderId, "CANCELLED", {
                        failureReason: "Cancelled by admin via command",
                        itemName: res.itemName,
                        gamertag: res.gamertag,
                        platformUserId: remoteJid
                    });
                }
                await ctx.sendText(
                    remoteJid,
                    t("cancel.adminCancelled", userLang, {
                        orderId: res.orderId,
                        gamertag: res.gamertag || "-",
                        itemName: res.itemName || "-",
                        totalFormatted: formatRupiah(res.totalNominal || 0)
                    })
                );
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("cancel.adminFailed", userLang, { orderId: targetId, error: errMsg }));
            }
            return;
        }

        // Case 2: No order ID provided
        // 2a. Check if user has an active pending payment order
        let pendingOrderId = ctx.state.getActiveOrderId(remoteJid);
        let pendingItemName: string | undefined;

        if (!pendingOrderId) {
            try {
                const userOrders = await ctx.client.getUserOrders(remoteJid);
                const found = userOrders?.find((o) => o.status === "PENDING_PAYMENT");
                if (found) {
                    pendingOrderId = found.id;
                    pendingItemName = found.itemName;
                }
            } catch {}
        }

        if (pendingOrderId) {
            try {
                const res = await ctx.client.cancelOrder(pendingOrderId, "Cancelled by buyer");
                if (ctx.adminLogger) {
                    await ctx.adminLogger.updateOrderStatus(res.orderId, "CANCELLED", {
                        failureReason: "Cancelled by buyer",
                        itemName: res.itemName || pendingItemName,
                        gamertag: res.gamertag,
                        platformUserId: remoteJid
                    });
                }
                if (ctx.qrDeleter) {
                    try {
                        await ctx.qrDeleter(remoteJid);
                    } catch {}
                }
                ctx.state.clearActiveOrderId(remoteJid);
                ctx.state.clearQrMessageKey(remoteJid);
                ctx.state.clear(remoteJid);

                const msg = t("cancel.orderCancelled", userLang, {
                    orderId: res.orderId,
                    itemName: res.itemName || pendingItemName || "Item"
                });
                await ctx.sendText(remoteJid, msg);
                return;
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const failMsg = t("cancel.failed", userLang, { orderId: pendingOrderId, error: errMsg });
                await ctx.sendText(remoteJid, failMsg);
                return;
            }
        }

        // 2b. If in the middle of active ordering wizard (before order creation)
        if (session.step !== "IDLE" && session.step !== "LIVE_CHAT" && session.step !== "AWAITING_SUPPORT_CONFIRMATION") {
            ctx.state.clear(remoteJid);
            await ctx.sendText(remoteJid, t("cancelSuccess", userLang));
            return;
        }

        // 2c. No active wizard and no pending order
        await ctx.sendText(remoteJid, t("cancel.noPending", userLang));
    },
};

export default cancelCommand;
