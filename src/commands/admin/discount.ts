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
            await ctx.sendText(remoteJid, t("admin.discountUsage", userLang));
            return;
        }

        const numberMatch = rawInput.match(/\b\d+\b/) || rawInput.match(/\d+/);
        if (!numberMatch) {
            await ctx.sendText(remoteJid, t("admin.discountRange", userLang));
            return;
        }

        const percent = parseInt(numberMatch[0], 10);
        if (isNaN(percent) || percent < 0 || percent > 90) {
            await ctx.sendText(remoteJid, t("admin.discountRange", userLang));
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
            await ctx.sendText(remoteJid, t("admin.discountFailed", userLang, { error: errMsg }));
        }
    },
};

export default discountCommand;
