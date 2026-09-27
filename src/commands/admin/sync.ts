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

        const waitMsg = prefix + (userLang === "en"
            ? "🔄 Starting catalog synchronization from The Hive via gibot... This may take ~10-20 seconds. Please wait."
            : "🔄 Memulai sinkronisasi katalog dari The Hive via gibot... Ini memerlukan waktu ~10-20 detik. Mohon tunggu.");

        await ctx.sendText(remoteJid, waitMsg, mentions);

        try {
            const res = await ctx.client.syncCatalog();

            // Invalidate poster cache so new items/prices appear immediately on next /katalog
            clearPosterCache();

            const tokenInfo = typeof res.tokens === "number" ? `${res.tokens} Token` : "-";
            const costumeTokenInfo = typeof res.costumeTokens === "number" ? `${res.costumeTokens} Token` : "-";

            const successMsg = prefix + (userLang === "en"
                ? `✅ *CATALOG SYNC COMPLETE!*\n\n• Items Updated: *${res.updated} items*\n• Remaining Gift Tokens: *${tokenInfo}* 🎁\n• Remaining Costume Tokens: *${costumeTokenInfo}* 🦹\n\nPoster cache cleared. Updated items are now live!`
                : `✅ *SINKRONISASI KATALOG BERHASIL!*\n\n• Item Terupdate: *${res.updated} item*\n• Sisa Token Gift: *${tokenInfo}* 🎁\n• Sisa Token Costume: *${costumeTokenInfo}* 🦹\n\nCache poster telah dibersihkan. Item baru sudah aktif di katalog!`);

            await ctx.sendText(remoteJid, successMsg, mentions);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const failMsg = prefix + (userLang === "en"
                ? `❌ Catalog sync failed: ${msg}`
                : `❌ Gagal sinkronisasi katalog: ${msg}`);
            await ctx.sendText(remoteJid, failMsg, mentions);
        }
    },
};

export default syncCatalogCommand;
