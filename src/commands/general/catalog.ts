import type { Command, CommandContext } from "../types";
import { CATEGORIES, resolveCategory, setKnownStoreDiscount } from "../../utils/categories";
import { generateCategoryPoster } from "../../poster";
import { renderCategoryItems } from "../../utils/formatters";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t } from "../../i18n";

export const catalogCommand: Command = {
    name: "/katalog",
    aliases: ["/catalog"],
    description: "Lihat katalog lengkap item The Hive",
    execute: async ({ remoteJid, sender, isGroup, args, userLang, ctx }: CommandContext) => {
        try {
            if (isGroup) {
                const senderPhone = extractPhoneNumber(sender);
                const groupNotice = t("catalog.groupNotice", userLang, { senderPhone });
                await ctx.sendText(remoteJid, groupNotice, [sender]);
            }

            const targetJid = isGroup ? sender : remoteJid;
            const catalog = await ctx.client.getCatalog();
            if (!catalog || catalog.length === 0) {
                await ctx.sendText(targetJid, t("catalog.unavailable", userLang));
                return;
            }

            const firstItem = catalog[0];
            if (firstItem && typeof firstItem.discountPercent === "number") {
                setKnownStoreDiscount(firstItem.discountPercent);
            }

            const filterQuery = args.join(" ").trim();
            if (filterQuery) {
                const matchedCat = resolveCategory(filterQuery, CATEGORIES);
                if (matchedCat) {
                    const catItems = catalog.filter((i) => i.active && i.category === matchedCat.dbCategory);
                    if (catItems.length === 0) {
                        await ctx.sendText(
                            targetJid,
                            t("catalog.categoryEmpty", userLang, { categoryName: matchedCat.displayName })
                        );
                        return;
                    }

                    try {
                        const poster = await generateCategoryPoster(matchedCat, catalog, userLang);
                        const caption = t("catalog.categoryCaption", userLang, {
                            categoryName: matchedCat.displayName.toUpperCase(),
                            count: catItems.length
                        });
                        await ctx.sendImage(targetJid, poster, caption);
                    } catch (err: unknown) {
                        const textCatalog = renderCategoryItems(catalog, matchedCat, userLang);
                        await ctx.sendText(
                            targetJid,
                            textCatalog + t("catalog.textFallbackNotice", userLang)
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
                await ctx.sendText(targetJid, t("catalog.allCategoriesEmpty", userLang));
                return;
            }

            for (const cat of activeCategories) {
                try {
                    const poster = await generateCategoryPoster(cat, catalog, userLang);
                    await ctx.sendImage(targetJid, poster);
                } catch (err: unknown) {
                    console.error(`[Catalog Poster Error for ${cat.displayName}]:`, err);
                    const textList = renderCategoryItems(catalog, cat, userLang);
                    await ctx.sendText(targetJid, textList);
                }
            }

            await ctx.sendText(targetJid, t("catalog.instruction", userLang));

        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error("[catalogCommand Error]:", errMsg);
            const targetJid = isGroup ? sender : remoteJid;
            await ctx.sendText(targetJid, t("catalog.fetchError", userLang, { message: errMsg }));
        }
    },
};

export default catalogCommand;
