import type { Command, CommandContext } from "../types";
import { config } from "../../config";

export const setgroupCommand: Command = {
    name: "/setgroup",
    adminOnly: true,
    description: "Daftarkan grup obrolan sebagai Admin Command Group atau Transaction Log Group",
    execute: async ({ remoteJid, args, isGroup, ctx }: CommandContext) => {
        const sub = args[0]?.toLowerCase();
        const targetJid = args[1]?.trim();

        if (isGroup) {
            if (sub === "admin") {
                if (ctx.adminLogger) {
                    ctx.adminLogger.setAdminGroupJid(remoteJid);
                    await ctx.sendText(
                        remoteJid,
                        `✅ Grup ini berhasil didaftarkan sebagai *Admin Command Group* ${config.STORE_NAME}!\nSemua anggota di grup ini dapat menjalankan perintah admin.`
                    );
                }
                return;
            }

            if (sub === "log" || sub === "logs") {
                if (ctx.adminLogger) {
                    ctx.adminLogger.setLogGroupJid(remoteJid);
                    await ctx.sendText(
                        remoteJid,
                        `✅ Grup ini berhasil didaftarkan sebagai *Transaction Log Group* ${config.STORE_NAME}!\nSemua notifikasi pesanan baru & update transaksi akan dikirim ke sini.`
                    );
                }
                return;
            }

            const adminGid = ctx.adminLogger?.getAdminGroupJid ? ctx.adminLogger.getAdminGroupJid() : ctx.adminLogger?.getGroupJid();
            const logGid = ctx.adminLogger?.getLogGroupJid ? ctx.adminLogger.getLogGroupJid() : ctx.adminLogger?.getGroupJid();
            const statusAdmin = adminGid === remoteJid ? "✅ Terdaftar (Grup Ini)" : (adminGid ? `✅ Terdaftar (${adminGid})` : "⚠️ Belum terdaftar");
            const statusLog = logGid === remoteJid ? "✅ Terdaftar (Grup Ini)" : (logGid ? `✅ Terdaftar (${logGid})` : "⚠️ Belum terdaftar");

            await ctx.sendText(
                remoteJid,
                `⚙️ *PENGATURAN GRUP ${config.STORE_NAME.toUpperCase()}*\n\n` +
                `Silakan tentukan peran grup ini:\n` +
                `• */setgroup admin* : Daftarkan grup ini sebagai *Admin Command Group* (semua anggota dapat menjalankan command admin)\n` +
                `• */setgroup log* : Daftarkan grup ini sebagai *Transaction Log Group* (khusus log transaksi & notifikasi)\n\n` +
                `_Status saat ini:_\n` +
                `• Admin Command Group: *${statusAdmin}*\n` +
                `• Transaction Log Group: *${statusLog}*`
            );
            return;
        }

        // Private chat invocations: /setgroup <role> <jid>
        if (sub === "admin" && targetJid && targetJid.endsWith("@g.us")) {
            if (ctx.adminLogger) {
                ctx.adminLogger.setAdminGroupJid(targetJid);
                await ctx.sendText(remoteJid, `✅ Berhasil mendaftarkan Admin Command Group: ${targetJid}`);
            }
        } else if ((sub === "log" || sub === "logs") && targetJid && targetJid.endsWith("@g.us")) {
            if (ctx.adminLogger) {
                ctx.adminLogger.setLogGroupJid(targetJid);
                await ctx.sendText(remoteJid, `✅ Berhasil mendaftarkan Transaction Log Group: ${targetJid}`);
            }
        } else if (sub && sub.endsWith("@g.us")) {
            // Legacy: /setgroup <JID>
            if (ctx.adminLogger) {
                ctx.adminLogger.setAdminGroupJid(sub);
                ctx.adminLogger.setGroupJid(sub);
                await ctx.sendText(remoteJid, `✅ Berhasil mendaftarkan Admin Group: ${sub}`);
            }
        } else {
            await ctx.sendText(
                remoteJid,
                `💡 *CARA MENDAFTARKAN ADMIN GROUP / LOG GROUP*\n\n` +
                `1. Masuk ke grup WhatsApp yang ingin didaftarkan\n` +
                `2. Ketik salah satu perintah langsung di dalam grup tersebut:\n` +
                `   • */setgroup admin* : Daftarkan sebagai *Admin Command Group*\n` +
                `   • */setgroup log* : Daftarkan sebagai *Transaction Log Group*\n\n` +
                `Atau via chat pribadi:\n` +
                `• */setgroup admin <JID_GRUP>*\n` +
                `• */setgroup log <JID_GRUP>*`
            );
        }
    },
};

export default setgroupCommand;
