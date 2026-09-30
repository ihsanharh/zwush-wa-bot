import type { Command, CommandContext } from "../types";
import { formatRupiah, t } from "../../i18n";

function parseFilterStatus(input?: string): string | undefined {
    if (!input) return undefined;
    const clean = input.trim().toLowerCase();
    if (clean === "all" || clean === "semua") return "ALL";
    if (clean === "fail" || clean === "failed" || clean === "gagal") return "FAILED";
    if (clean === "success" || clean === "berhasil" || clean === "sukses") return "SUCCESS";
    if (clean === "queued" || clean === "antre" || clean === "antrean") return "QUEUED";
    if (clean === "pending" || clean === "bayar" || clean === "unpaid") return "PENDING_PAYMENT";
    if (clean === "tokens" || clean === "token" || clean === "saldo") return "INSUFFICIENT_TOKENS";
    if (clean === "gifting" || clean === "proses") return "GIFTING";
    return clean.toUpperCase();
}

function getStatusBadge(status: string): string {
    switch (status) {
        case "SUCCESS":
            return "✅ SUCCESS";
        case "FAILED":
            return "❌ FAILED";
        case "INSUFFICIENT_TOKENS":
            return "⚠️ TOKEN DEFICIT";
        case "QUEUED":
            return "⏳ QUEUED";
        case "GIFTING":
            return "🎁 GIFTING";
        case "PENDING_PAYMENT":
            return "💳 PENDING";
        case "EXPIRED":
            return "⏱️ EXPIRED";
        case "CANCELLED":
            return "🚫 CANCELLED";
        default:
            return status;
    }
}

function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        return d.toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch {
        return dateStr;
    }
}

export const ordersCommand: Command = {
    name: "/orders",
    aliases: ["/daftarorder", "/listorders", "/orderan"],
    adminOnly: true,
    order: 15,
    category: "order",
    description: "Lihat daftar pesanan terbaru (semua/failed/success/queued/pending)",
    locales: {
        en: {
            name: "/orders",
            description: "View recent order list (all/failed/success/queued/pending)"
        }
    },
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        const rawFilter = args[0];
        const status = parseFilterStatus(rawFilter);
        const displayFilter = status || "ALL";

        try {
            const res = await ctx.client.listOrders(status === "ALL" ? undefined : status, 10);
            if (!res.orders || res.orders.length === 0) {
                await ctx.sendText(
                    remoteJid,
                    t("admin.ordersEmpty", userLang, { filter: displayFilter })
                );
                return;
            }

            let msg = t("admin.ordersHeader", userLang, { filter: displayFilter });

            for (const order of res.orders) {
                const badge = getStatusBadge(order.status);
                const time = formatDate(order.createdAt);
                const price = formatRupiah(order.totalNominal);
                const reason = order.failureReason ? `\n   _⚠️ Alasan: ${order.failureReason}_` : "";

                msg += `• *#${order.id}* — ${badge}\n`;
                msg += `   👤 *${order.gamertag}* | 📦 ${order.itemName}\n`;
                msg += `   💰 ${price} | 🕒 ${time}${reason}\n\n`;
            }

            msg += t("admin.ordersFooter", userLang);

            await ctx.sendText(remoteJid, msg.trim());
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal mengambil daftar order: ${errMsg}`);
        }
    },
};

export default ordersCommand;
