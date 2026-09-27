import type { Command, CommandContext } from "../types";

export const reprocessCommand: Command = {
    name: "/reprocess",
    aliases: ["/retry"],
    adminOnly: true,
    description: "Proses ulang pesanan yang tertahan stok token",
    execute: async ({ remoteJid, args, ctx }: CommandContext) => {
        if (args.length === 0) {
            try {
                const res = await ctx.client.retryAllOrders();
                await ctx.sendText(
                    remoteJid,
                    `🔄 *REPROCESS SELESAI*\n\n` +
                    `✅ Berhasil memproses ulang *${res.count} pesanan* yang tertahan token:\n` +
                    (res.orderIds.length > 0 ? res.orderIds.map((id) => `• #${id}`).join("\n") : "_Tidak ada pesanan yang tertahan._")
                );
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `❌ Gagal memproses ulang pesanan: ${errMsg}`);
            }
        } else {
            const targetId = (args[0] || "").replace(/^#/, "");
            try {
                const res = await ctx.client.retryOrder(targetId);
                await ctx.sendText(
                    remoteJid,
                    `🔄 *PESANAN #${res.orderId} DIPROSES ULANG*\n\n` +
                    `Pesanan telah dimasukkan kembali ke dalam antrean gifting The Hive! 🚀`
                );
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `❌ Gagal memproses ulang pesanan #${targetId}: ${errMsg}`);
            }
        }
    },
};

export default reprocessCommand;
