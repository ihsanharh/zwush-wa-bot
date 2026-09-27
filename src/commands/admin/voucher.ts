import type { Command, CommandContext } from "../types";
import { formatRupiah, t } from "../../i18n";

export const voucherCommand: Command = {
    name: "/voucher",
    adminOnly: true,
    englishName: "/voucher",
    order: 70,
    description: "Kelola kode voucher diskon toko (list, create, delete)",
    descriptionEn: "Manage promo voucher codes (list, create, delete)",
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        const subCmd = (args[0] || "").toLowerCase();

        if (!subCmd || subCmd === "list" || subCmd === "daftar") {
            try {
                const status = await ctx.client.getVoucherStatus();
                let out = t("admin.voucherHeader", userLang, { discount: status.discountPercent });

                if (status.vouchers.length === 0) {
                    out += t("admin.voucherEmpty", userLang);
                } else {
                    status.vouchers.forEach((v, idx) => {
                        const val = v.discountType === "PERCENT" ? `${v.discountValue}%` : formatRupiah(v.discountValue);
                        const quota = v.maxUses ? `${v.usedCount}/${v.maxUses}` : `${v.usedCount}/∞`;
                        const statusTag = v.active ? "✅" : "❌";
                        out += t("admin.voucherItem", userLang, {
                            idx: idx + 1,
                            code: v.code,
                            val,
                            quota,
                            status: statusTag
                        });
                    });
                }

                out += t("admin.voucherFooter", userLang);
                await ctx.sendText(remoteJid, out);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("admin.voucherFetchFailed", userLang, { error: errMsg }));
            }
            return;
        }

        if (subCmd === "create" || subCmd === "buat") {
            const code = (args[1] || "").trim().toUpperCase();
            const valueRaw = (args[2] || "").trim();
            const quotaRaw = args[3]?.trim();

            if (!code || !valueRaw) {
                await ctx.sendText(remoteJid, t("admin.voucherUsage", userLang));
                return;
            }

            let discountType: "PERCENT" | "FLAT" = "FLAT";
            let discountValue = 0;

            if (valueRaw.endsWith("%")) {
                discountType = "PERCENT";
                discountValue = parseInt(valueRaw.replace("%", ""), 10);
                if (isNaN(discountValue) || discountValue < 1 || discountValue > 90) {
                    await ctx.sendText(remoteJid, t("admin.voucherPercentRange", userLang));
                    return;
                }
            } else {
                const cleanedNum = parseInt(valueRaw.replace(/[^0-9]/g, ""), 10);
                discountValue = cleanedNum;
                if (isNaN(discountValue) || discountValue < 1000) {
                    await ctx.sendText(remoteJid, t("admin.voucherMinFlat", userLang));
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
                    maxUses: maxUses ?? t("admin.voucherUnlimited", userLang)
                }));
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("admin.voucherCreateFailed", userLang, { error: errMsg }));
            }
            return;
        }

        if (subCmd === "delete" || subCmd === "hapus") {
            const code = (args[1] || "").trim().toUpperCase();
            if (!code) {
                await ctx.sendText(remoteJid, t("admin.voucherDeleteUsage", userLang));
                return;
            }

            try {
                await ctx.client.deleteVoucher(code);
                await ctx.sendText(remoteJid, t("voucherDeleted", userLang, { code }));
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("admin.voucherDeleteFailed", userLang, { error: errMsg }));
            }
            return;
        }

        // Default unknown voucher subcommand
        await ctx.sendText(remoteJid, t("admin.voucherUnknown", userLang));
    },
};

export default voucherCommand;
