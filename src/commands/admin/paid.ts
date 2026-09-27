import type { Command, CommandContext } from "../types";
import { formatRupiah } from "../../i18n";

export const paidCommand: Command = {
    name: "/paid",
    aliases: ["/acc", "/approve", "/bayar"],
    adminOnly: true,
    description: "Verifikasi manual pembayaran order & masukkan ke antrean gifting",
    execute: async ({ remoteJid, args, ctx }: CommandContext) => {
        if (args.length === 0) {
            await ctx.sendText(
                remoteJid,
                `ℹ️ *FORMAT PERINTAH BYPASS PEMBAYARAN:*\n\n` +
                `Gunakan: */paid <order_id>*\n` +
                `Contoh:\n` +
                `• */paid ORD-I82AME*\n` +
                `• */paid I82AME*\n` +
                `• */acc ORD-I82AME*\n\n` +
                `_Perintah ini digunakan oleh admin jika HP MacroDroid mati atau webhook tidak tertrigger, untuk memvalidasi pembayaran secara manual dan langsung memproses gifting._`
            );
            return;
        }

        let targetId = (args[0] || "").trim().toUpperCase().replace(/^#/, "");
        if (!targetId.startsWith("ORD-")) {
            targetId = "ORD-" + targetId;
        }

        try {
            const res = await ctx.client.markOrderAsPaid(targetId);
            await ctx.sendText(
                remoteJid,
                `✅ *PEMBAYARAN DIVERIFIKASI MANUAL (BYPASS)*\n\n` +
                `🆔 Order ID: *#${res.orderId}*\n` +
                `👤 Gamertag: *${res.gamertag}*\n` +
                `🎁 Item: *${res.itemName}*\n` +
                `💰 Total: *${formatRupiah(res.totalNominal)}*\n` +
                `📊 Status: *QUEUED* ⏳\n\n` +
                `Pesanan berhasil ditandai LUNAS dan telah dimasukkan ke antrean gifting bot! 🚀\n` +
                `_Pembeli juga otomatis menerima notifikasi WhatsApp dan QRIS-nya telah dihapus._`
            );
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal menandai pesanan #${targetId} sebagai lunas:\n${errMsg}`);
        }
    },
};

export default paidCommand;
