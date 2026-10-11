import type { Command, CommandContext } from "../types";
import { CATEGORIES, resolveCategory } from "../../utils/categories";
import { renderOrderCategoryMenu, sendCategoryOrderPoster } from "../../utils/formatters";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t } from "../../i18n";

export const menuCommand: Command = {
    name: "/beli",
    aliases: ["/buy", "/menu"],
    order: 10,
    category: "general",
    description: "Lihat katalog & mulai belanja kosmetik The Hive",
    locales: {
        en: {
            name: "/buy",
            description: "Browse catalog & start ordering The Hive cosmetics"
        }
    },
    execute: async ({ remoteJid, sender, isGroup, args, userLang, ctx }: CommandContext) => {
        const filterQuery = args.join(" ").trim();

        if (isGroup) {
            const senderPhone = extractPhoneNumber(sender);
            const currentSession = ctx.state.getSession(sender);
            if (currentSession.step !== "IDLE") {
                const alreadyActiveNotice = `@${senderPhone}\n\n` + t("menu.alreadyActiveNotice", userLang);
                await ctx.sendText(remoteJid, alreadyActiveNotice, [sender]);
                return;
            }

            const groupNotice = t("groupCheckoutRedirection", userLang, { phone: senderPhone });
            await ctx.sendText(remoteJid, groupNotice, [sender]);

            if (ctx.sendList) {
                const { buildCategoryListMenu } = await import("../../utils/interactiveBuilders");
                await ctx.sendList(sender, buildCategoryListMenu(CATEGORIES, userLang));
            } else {
                const dmMenu = renderOrderCategoryMenu(userLang);
                await ctx.sendText(sender, dmMenu);
            }
            return;
        }

        if (filterQuery) {
            const cat = resolveCategory(filterQuery, CATEGORIES);
            if (cat) {
                const session = ctx.state.getSession(remoteJid);
                session.selectedCategory = cat.dbCategory;
                session.catalogPage = 1;
                await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
                if (ctx.sendList) {
                    const { buildPaginatedItemListMenu } = await import("../../utils/interactiveBuilders");
                    const catalog = await ctx.client.getCatalog();
                    await ctx.sendList(remoteJid, buildPaginatedItemListMenu(catalog, cat, 1, 8, userLang));
                }
                return;
            }

            // Invalid category filter
            let categoryList = "";
            CATEGORIES.forEach((c) => {
                categoryList += `• *${c.id}*. ${c.displayName.replace(/^\d+\.\s*/, "")}\n`;
            });
            const errMsg = t("menu.categoryNotFound", userLang, { query: filterQuery, categoryList: categoryList.trim() });
            await ctx.sendText(remoteJid, errMsg);
            return;
        }

        if (ctx.sendList) {
            const { buildCategoryListMenu } = await import("../../utils/interactiveBuilders");
            await ctx.sendList(remoteJid, buildCategoryListMenu(CATEGORIES, userLang));
        } else {
            await ctx.sendText(remoteJid, renderOrderCategoryMenu(userLang));
        }
    },
};

export default menuCommand;
