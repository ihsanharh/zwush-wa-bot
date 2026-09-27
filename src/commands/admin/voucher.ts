import type { Command, CommandContext } from "../types";
import { formatRupiah, t } from "../../i18n";

export const voucherCommand: Command = {
    name: "/voucher",
    adminOnly: true,
    description: "Kelola kode voucher diskon toko (list, create, delete)",
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        const subCmd = (args[0] || "").toLowerCase();

        if (!subCmd || subCmd === "list" || subCmd === "daftar") {
            try {
                const status = await ctx.client.getVoucherStatus();
                let out = userLang === "en"
                    ? `🎟️ *VOUCHER & PROMO MANAGEMENT*\n\n`
                    : `🎟️ *MANAJEMEN VOUCHER & PROMO*\n\n`;

                out += userLang === "en"
                    ? `🏷️ Active Store Discount: *${status.discountPercent}%*\n\n`
                    : `🏷️ Diskon Toko Global: *${status.discountPercent}%*\n\n`;

                out += userLang === "en" ? `*Active Voucher Codes:*\n` : `*Daftar Voucher Aktif:*\n`;

                if (status.vouchers.length === 0) {
                    out += userLang === "en"
                        ? `_No active vouchers found._\n`
                        : `_Belum ada voucher yang aktif saat ini._\n`;
                } else {
                    status.vouchers.forEach((v, idx) => {
                        const val = v.discountType === "PERCENT" ? `${v.discountValue}%` : formatRupiah(v.discountValue);
                        const quota = v.maxUses ? `${v.usedCount}/${v.maxUses}` : `${v.usedCount}/∞`;
                        const statusTag = v.active ? "✅" : "❌";
                        out += `${idx + 1}. *${v.code}* (${val}) — Kuota: ${quota} ${statusTag}\n`;
                    });
                }

                out += userLang === "en"
                    ? `\n💡 *Commands:*\n• */voucher create <CODE> <VALUE> [QUOTA]*\n  (e.g. */voucher create SAVE10 10% 50* or */voucher create FLAT5K 5000*)\n• */voucher delete <CODE>*`
                    : `\n💡 *Perintah:*\n• */voucher create <KODE> <NILAI> [KUOTA]*\n  (contoh: */voucher create HEMAT10 10% 50* atau */voucher buat POTONGAN 5000*)\n• */voucher delete <KODE>*`;

                await ctx.sendText(remoteJid, out);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `❌ Gagal mengambil status voucher: ${errMsg}`);
            }
            return;
        }

        if (subCmd === "create" || subCmd === "buat") {
            const code = (args[1] || "").trim().toUpperCase();
            const valueRaw = (args[2] || "").trim();
            const quotaRaw = args[3]?.trim();

            if (!code || !valueRaw) {
                const err = userLang === "en"
                    ? `💡 *Usage:* */voucher create <CODE> <VALUE> [QUOTA]*\nExamples:\n• */voucher create SAVE10 10% 50*\n• */voucher create FLAT5K 5000*`
                    : `💡 *Penggunaan:* */voucher create <KODE> <NILAI> [KUOTA]*\nContoh:\n• */voucher create HEMAT10 10% 50*\n• */voucher buat POTONGAN 5000*`;
                await ctx.sendText(remoteJid, err);
                return;
            }

            let discountType: "PERCENT" | "FLAT" = "FLAT";
            let discountValue = 0;

            if (valueRaw.endsWith("%")) {
                discountType = "PERCENT";
                discountValue = parseInt(valueRaw.replace("%", ""), 10);
                if (isNaN(discountValue) || discountValue < 1 || discountValue > 90) {
                    const msg = userLang === "en"
                        ? `❌ Percentage discount must be between 1% and 90%.`
                        : `❌ Diskon persentase harus antara 1% hingga 90%.`;
                    await ctx.sendText(remoteJid, msg);
                    return;
                }
            } else {
                const cleanedNum = parseInt(valueRaw.replace(/[^0-9]/g, ""), 10);
                discountValue = cleanedNum;
                if (isNaN(discountValue) || discountValue < 1000) {
                    const msg = userLang === "en"
                        ? `❌ Flat discount must be at least Rp 1.000.`
                        : `❌ Diskon nominal minimal Rp 1.000.`;
                    await ctx.sendText(remoteJid, msg);
                    return;
                }
            }

            let maxUses: number | undefined;
            if (quotaRaw) {
                const q = parseInt(quotaRaw, 10);
                if (!isNaN(q) && q > 0) {
                    maxUses = q;
                }
            }

            try {
                await ctx.client.createVoucher({
                    code,
                    discountType,
                    discountValue,
                    maxUses
                });
                const formattedVal = discountType === "PERCENT" ? `${discountValue}%` : formatRupiah(discountValue);
                await ctx.sendText(remoteJid, t("voucherCreated", userLang, {
                    code,
                    discountType,
                    discountValue: formattedVal,
                    maxUses: maxUses ?? (userLang === "en" ? "Unlimited" : "Tak terbatas")
                }));
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `❌ Gagal membuat voucher: ${errMsg}`);
            }
            return;
        }

        if (subCmd === "delete" || subCmd === "hapus") {
            const code = (args[1] || "").trim().toUpperCase();
            if (!code) {
                const err = userLang === "en"
                    ? `💡 *Usage:* */voucher delete <CODE>*`
                    : `💡 *Penggunaan:* */voucher delete <KODE>*`;
                await ctx.sendText(remoteJid, err);
                return;
            }

            try {
                await ctx.client.deleteVoucher(code);
                await ctx.sendText(remoteJid, t("voucherDeleted", userLang, { code }));
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `❌ Gagal menghapus voucher: ${errMsg}`);
            }
            return;
        }

        // Default unknown voucher subcommand
        await ctx.sendText(
            remoteJid,
            userLang === "en"
                ? `⚠️ Unknown voucher command. Use */voucher list*, */voucher create*, or */voucher delete*.`
                : `⚠️ Perintah voucher tidak dikenal. Gunakan */voucher list*, */voucher create*, atau */voucher delete*.`
        );
    },
};

export default voucherCommand;
