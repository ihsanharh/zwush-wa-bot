import type { Command, CommandContext } from "../types";
import { clearPosterCache } from "../../poster";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const syncCatalogCommand: Command = {
    name: "/sync",
    aliases: ["/synckatalog", "/synccatalog"],
    adminOnly: true,
    description: "Sinkronisasi seluruh item katalog dari The Hive ke database",
    execute: async ({ remoteJid, isGroup, sender, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;

        try {
            await ctx.client.syncCatalog();

            // Invalidate poster cache so new items/prices appear immediately on next /katalog
            clearPosterCache();

            const successMsg = prefix + (userLang === "en"
                ? `🔄 *CATALOG SYNC INITIATED!*\n\nSync process has started in the server background via gibot. Catalog items and prices will automatically update once complete.`
                : `🔄 *SINKRONISASI KATALOG DIMULAI!*\n\nProses sinkronisasi telah berjalan di latar belakang server via gibot. Item dan harga katalog akan otomatis terupdate setelah proses selesai.`);

            await ctx.sendText(remoteJid, successMsg, mentions);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const failMsg = prefix + (userLang === "en"
                ? `❌ Failed to initiate catalog sync: ${msg}`
                : `❌ Gagal memulai sinkronisasi katalog: ${msg}`);
            await ctx.sendText(remoteJid, failMsg, mentions);
        }
    },
};

export default syncCatalogCommand;
