import type { Command, CommandContext } from "../types";
import { clearPosterCache } from "../../poster";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t } from "../../i18n";

export const syncCatalogCommand: Command = {
    name: "/sync",
    aliases: ["/synckatalog", "/synccatalog"],
    adminOnly: true,
    order: 45,
    category: "store",
    description: "Sinkronisasi seluruh item katalog dari The Hive ke database",
    locales: {
        en: {
            name: "/sync",
            description: "Synchronize catalog items from The Hive to database"
        }
    },
    execute: async ({ remoteJid, isGroup, sender, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;

        try {
            await ctx.client.syncCatalog();

            // Invalidate poster cache so new items/prices appear immediately on next /katalog
            clearPosterCache();

            const successMsg = prefix + t("admin.syncSuccess", userLang);
            await ctx.sendText(remoteJid, successMsg, mentions);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const failMsg = prefix + t("admin.syncFailed", userLang, { message: msg });
            await ctx.sendText(remoteJid, failMsg, mentions);
        }
    },
};

export default syncCatalogCommand;
export const syncCommand = syncCatalogCommand;
