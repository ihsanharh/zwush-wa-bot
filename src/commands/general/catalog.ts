import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { CATEGORIES, currentStoreDiscount, resolveCategory, setKnownStoreDiscount } from "../../utils/categories";
import { generateCategoryPoster } from "../../poster";
import { renderCategoryItems } from "../../utils/formatters";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const catalogCommand: Command = {
    name: "/katalog",
    aliases: ["/catalog"],
    description: "Lihat katalog lengkap item The Hive",
    execute: async ({ remoteJid, sender, isGroup, args, userLang, ctx }: CommandContext) => {
        try {
            if (isGroup) {
                const senderPhone = extractPhoneNumber(sender);
                const groupNotice = userLang === "en"
                    ? `@${senderPhone}\n\n📁 The catalog posters have been sent to your private chat! Please check your DM 😊\nType */buy* in DM to order!`
                    : `@${senderPhone}\n\n📁 Gambar katalog telah dikirimkan ke chat pribadi kakak ya! Silakan cek DM 😊\nKetik */beli* di DM untuk memesan!`;
                await ctx.sendText(remoteJid, groupNotice, [sender]);
            }

            const targetJid = isGroup ? sender : remoteJid;
            const catalog = await ctx.client.getCatalog();
            if (!catalog || catalog.length === 0) {
                await ctx.sendText(
                    targetJid,
                    userLang === "en"
                        ? `⚠️ Catalog is currently unavailable. Please try again in a few moments.`
                        : `⚠️ Katalog saat ini sedang tidak dapat dimuat nih kak. Coba beberapa saat lagi ya.`
                );
                return;
            }

            if (catalog.length > 0 && typeof catalog[0].discountPercent === "number") {
                setKnownStoreDiscount(catalog[0].discountPercent);
            }

            const filterQuery = args.join(" ").trim();
            if (filterQuery) {
                const matchedCat = resolveCategory(filterQuery, CATEGORIES);
                if (matchedCat) {
                    const catItems = catalog.filter((i) => i.active && i.category === matchedCat.dbCategory);
                    if (catItems.length === 0) {
                        await ctx.sendText(
                            targetJid,
                            userLang === "en"
                                ? `⚠️ No active items in category *${matchedCat.displayName}*.`
                                : `⚠️ Belum ada item aktif di kategori *${matchedCat.displayName}*.`
                        );
                        return;
                    }

                    try {
                        const poster = await generateCategoryPoster(matchedCat, catalog);
                        const caption = userLang === "en"
                            ? `📁 *CATALOG: ${matchedCat.displayName.toUpperCase()}* (${catItems.length} Items)\n\n🛒 *Ready to order?* Type */buy* to start purchasing! ✨`
                            : `📁 *KATALOG: ${matchedCat.displayName.toUpperCase()}* (${catItems.length} Item)\n\n🛒 *Mau beli item di atas?* Ketik */beli* untuk mulai memesan ya kak! ✨`;
                        await ctx.sendImage(targetJid, poster, caption);
                    } catch (err: unknown) {
                        const textCatalog = renderCategoryItems(catalog, matchedCat, userLang);
                        await ctx.sendText(
                            targetJid,
                            textCatalog + (userLang === "en" ? "\n\n💡 Type */buy* to start ordering!" : "\n\n💡 Ketik */beli* untuk mulai memesan ya kak!")
                        );
                    }
                    return;
                }
            }

            // Send all category posters
            const activeCategories = CATEGORIES.filter((cat) =>
                catalog.some((i) => i.active && i.category === cat.dbCategory)
            );

            if (activeCategories.length === 0) {
                await ctx.sendText(
                    targetJid,
                    userLang === "en"
                        ? `⚠️ No active items in the catalog yet.`
                        : `⚠️ Belum ada item aktif di katalog saat ini.`
                );
                return;
            }

            for (const cat of activeCategories) {
                try {
                    const poster = await generateCategoryPoster(cat, catalog);
                    await ctx.sendImage(targetJid, poster);
                } catch (err: unknown) {
                    console.error(`[Catalog Poster Error for ${cat.displayName}]:`, err);
                    const textList = renderCategoryItems(catalog, cat, userLang);
                    await ctx.sendText(targetJid, textList);
                }
            }

            const totalItems = catalog.filter((i) => i.active).length;
            const categoryLines = activeCategories
                .map((c) => {
                    const count = catalog.filter((i) => i.active && i.category === c.dbCategory).length;
                    return `• *${c.displayName}* (${count} item)`;
                })
                .join("\n");

            const ctaMessage = userLang === "en"
                ? `━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🛒 *ALL CATALOG CATEGORIES* (${totalItems} Items)\n\n` +
                  `${categoryLines}\n\n` +
                  `${currentStoreDiscount > 0 ? `⚡ Store discount up to *${currentStoreDiscount}%* is active!\n\n` : `⚡ Official store special prices!\n\n`}` +
                  `👉 To start purchasing any item, type */buy* or */beli*! 🛍️`
                : `━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🛒 *KATALOG LENGKAP ${config.STORE_NAME.toUpperCase()}* (${totalItems} Item)\n\n` +
                  `${categoryLines}\n\n` +
                  `${currentStoreDiscount > 0 ? `⚡ Promo diskon resmi s/d *${currentStoreDiscount}%* sedang berlangsung!\n\n` : `⚡ Harga promo resmi The Hive!\n\n`}` +
                  `👉 Mau beli item di atas? Ketik */beli* untuk mulai memesan ya kak! 🛍️`;

            await ctx.sendText(targetJid, ctaMessage);

        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error("[catalogCommand Error]:", errMsg);
            const targetJid = isGroup ? sender : remoteJid;
            await ctx.sendText(
                targetJid,
                userLang === "en"
                    ? `❌ Failed to load catalog: ${errMsg}\n\n💡 Please wait a moment and try again.`
                    : `❌ Gagal memuat katalog: ${errMsg}\n\n💡 Mohon tunggu beberapa saat dan coba lagi ya kak.`
            );
        }
    },
};

export default catalogCommand;
