import type { Command, CommandContext } from "../types";
import { CATEGORIES, resolveCategory } from "../../utils/categories";
import { renderOrderCategoryMenu, sendCategoryOrderPoster } from "../../utils/formatters";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t } from "../../i18n";

export const menuCommand: Command = {
    name: "/beli",
    aliases: ["/buy", "/menu"],
    description: "Buka menu pembelian katalog Hive",
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

            ctx.state.startBuyingFlow(sender);
            const dmMenu = renderOrderCategoryMenu(userLang);
            await ctx.sendText(sender, dmMenu);
            return;
        }

        if (filterQuery) {
            const cat = resolveCategory(filterQuery, CATEGORIES);
            if (cat) {
                ctx.state.setCategory(remoteJid, cat.dbCategory);
                await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
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

        ctx.state.startBuyingFlow(remoteJid);
        await ctx.sendText(remoteJid, renderOrderCategoryMenu(userLang));
    },
};

export default menuCommand;
