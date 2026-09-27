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
                await ctx.sendText(remoteJid, t("adminOnly", userLang));
                return;
            }

            let targetId = args[0].trim().toUpperCase().replace(/^#/, "");
            if (!targetId.startsWith("ORD-")) {
                targetId = "ORD-" + targetId;
            }

            try {
                const res = await ctx.client.cancelOrder(targetId, "Cancelled by admin via command");
                await ctx.sendText(
                    remoteJid,
                    `✅ *PESANAN DIBATALKAN OLEH ADMIN*\n\n` +
                    `🆔 Order ID: *#${res.orderId}*\n` +
                    `👤 Gamertag: *${res.gamertag || "-"}*\n` +
                    `📦 Item: *${res.itemName || "-"}*\n` +
                    `💰 Total: *${formatRupiah(res.totalNominal || 0)}*\n` +
                    `📊 Status: *CANCELLED* ❌\n\n` +
                    `Pesanan berhasil dibatalkan. Kode unik & kuota voucher (jika ada) telah dikembalikan.`
                );
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `❌ Gagal membatalkan pesanan #${targetId}:\n${errMsg}`);
            }
            return;
        }

        // Case 2: No order ID provided
        // 2a. If in the middle of active ordering wizard
        if (session.step !== "IDLE" && session.step !== "LIVE_CHAT" && session.step !== "AWAITING_SUPPORT_CONFIRMATION") {
            ctx.state.clear(remoteJid);
            await ctx.sendText(remoteJid, t("cancelSuccess", userLang));
            return;
        }

        // 2b. Check if user has an active pending payment order
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
                if (ctx.qrDeleter) {
                    try {
                        await ctx.qrDeleter(remoteJid);
                    } catch {}
                }
                ctx.state.clearActiveOrderId(remoteJid);
                ctx.state.clearQrMessageKey(remoteJid);
                ctx.state.clear(remoteJid);

                const msg = userLang === "en" ? (
                    `✅ *ORDER CANCELLED*\n\n` +
                    `Your order *#${res.orderId}* (*${res.itemName || pendingItemName || "Item"}*) has been successfully cancelled.\n\n` +
                    `Unique payment code & voucher quota have been returned. Type */buy* or */katalog* whenever you want to create a new order! 😊`
                ) : (
                    `✅ *PESANAN BERHASIL DIBATALKAN*\n\n` +
                    `Pesanan kakak *#${res.orderId}* (*${res.itemName || pendingItemName || "Item"}*) telah berhasil dibatalkan.\n\n` +
                    `Kode unik & kuota voucher kakak sudah dikembalikan. Silakan ketik */beli* atau */katalog* jika ingin membuat pesanan baru ya kak! 😊`
                );
                await ctx.sendText(remoteJid, msg);
                return;
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const failMsg = userLang === "en"
                    ? `❌ Failed to cancel order #${pendingOrderId}: ${errMsg}`
                    : `❌ Gagal membatalkan pesanan #${pendingOrderId}: ${errMsg}`;
                await ctx.sendText(remoteJid, failMsg);
                return;
            }
        }

        // 2c. No active wizard and no pending order
        const noOrderMsg = userLang === "en"
            ? `💡 You don't have any active order waiting for payment.\nType */buy* or */catalog* to start shopping! 😊`
            : `💡 Kakak sedang tidak memiliki pesanan yang menunggu pembayaran.\nKetik */beli* atau */katalog* untuk mulai berbelanja ya kak! 😊`;
        await ctx.sendText(remoteJid, noOrderMsg);
    },
};

export default cancelCommand;
