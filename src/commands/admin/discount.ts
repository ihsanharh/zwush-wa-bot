import type { Command, CommandContext } from "../types";
import { setKnownStoreDiscount } from "../../utils/categories";
import { clearPosterCache } from "../../poster";
import { t } from "../../i18n";

export const discountCommand: Command = {
    name: "/setdiskon",
    aliases: ["/setdiscount"],
    adminOnly: true,
    description: "Ubah persentase diskon toko global (0-90)",
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        const rawInput = args.join(" ").trim();
        if (!rawInput) {
            const usage = userLang === "en"
                ? `💡 *Usage:* */setdiscount <0-90>*\nExample: */setdiscount 60%* or */setdiscount 40*\nUse *0* to disable discount.`
                : `💡 *Penggunaan:* */setdiskon <0-90>*\nContoh: */setdiskon 60%* atau */setdiskon 40*\nGunakan *0* untuk mematikan diskon.`;
            await ctx.sendText(remoteJid, usage);
            return;
        }

        const numberMatch = rawInput.match(/\b\d+\b/) || rawInput.match(/\d+/);
        if (!numberMatch) {
            const err = userLang === "en"
                ? `❌ Discount percentage must be a whole number between 0 and 90.`
                : `❌ Persentase diskon harus berupa angka bulat antara 0 hingga 90.`;
            await ctx.sendText(remoteJid, err);
            return;
        }

        const percent = parseInt(numberMatch[0], 10);
        if (isNaN(percent) || percent < 0 || percent > 90) {
            const err = userLang === "en"
                ? `❌ Discount percentage must be a whole number between 0 and 90.`
                : `❌ Persentase diskon harus berupa angka bulat antara 0 hingga 90.`;
            await ctx.sendText(remoteJid, err);
            return;
        }

        try {
            await ctx.client.setStoreDiscount(percent);
            setKnownStoreDiscount(percent);
            clearPosterCache();
            await ctx.sendText(remoteJid, t("discountUpdated", userLang, { percent }));
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error("[SetDiscount Error]:", errMsg);
            await ctx.sendText(remoteJid, `❌ Gagal mengubah diskon: ${errMsg}`);
        }
    },
};

export default discountCommand;
