import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const adminCommand: Command = {
    name: "/admin",
    adminOnly: true,
    description: "Panel daftar perintah khusus admin toko",
    execute: async ({ remoteJid, sender, ctx }: CommandContext) => {
        const cleanPhone = extractPhoneNumber(sender);
        const adminGid = ctx.adminLogger?.getAdminGroupJid ? ctx.adminLogger.getAdminGroupJid() : ctx.adminLogger?.getGroupJid();
        const logGid = ctx.adminLogger?.getLogGroupJid ? ctx.adminLogger.getLogGroupJid() : ctx.adminLogger?.getGroupJid();
        const adminStatus = adminGid ? `✅ Terdaftar (${adminGid})` : `⚠️ Belum terdaftar (Ketik /setgroup admin di grup admin)`;
        const logStatus = logGid ? `✅ Terdaftar (${logGid})` : `⚠️ Belum terdaftar (Ketik /setgroup log di grup log)`;

        let out = `🛠️ *PANEL ADMIN ${config.STORE_NAME.toUpperCase()}*\n\n`;
        out += `👤 Status: *Terverifikasi Admin ✅*\n`;
        if (cleanPhone) out += `📱 Nomor: *+${cleanPhone}*\n`;
        out += `👥 Admin Group: *${adminStatus}*\n`;
        out += `📋 Log Group: *${logStatus}*\n\n`;
        out += `*Daftar Perintah Admin:*\n`;
        out += `• */saldo* / */balance* : Cek saldo token bot The Hive & omset hari ini\n`;
        out += `• */sync* / */synckatalog* : Sinkronisasi katalog item dari The Hive ke database\n`;
        out += `• */paid <ID>* / */acc <ID>* : Verifikasi manual pembayaran order (bypass GoPay) & proses gift\n`;
        out += `• */reprocess* : Proses ulang semua order tertahan token\n`;
        out += `• */reprocess <ID>* : Proses ulang order tertentu\n`;
        out += `• */solved <ID/No>* : Selesaikan sesi live chat support & aktifkan bot kembali\n`;
        out += `• */setgroup admin* : Daftarkan grup obrolan sebagai Admin Command Group\n`;
        out += `• */setgroup log* : Daftarkan grup obrolan sebagai Transaction Log Group\n`;
        out += `• */setdiskon <0-90>* : Ubah persentase diskon toko global\n`;
        out += `• */voucher* : Kelola kode voucher promo (list/create/delete)\n`;
        out += `• */status <ID>* : Cek detail status order manapun\n`;

        await ctx.sendText(remoteJid, out);
    },
};

export default adminCommand;
