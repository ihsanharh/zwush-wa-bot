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
                const alreadyActiveNotice = userLang === "en"
                    ? `@${senderPhone}\n\n💡 Your shopping session is already active in private chat! Please continue your order there 😊 (or type *c* in private chat to cancel).`
                    : `@${senderPhone}\n\n💡 Sesi belanja kakak sudah aktif di chat pribadi! Silakan lanjutkan pemesanan di chat pribadi ya kak 😊 (atau ketik *b* di chat pribadi untuk batal).`;
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
            if (userLang === "en") {
                let errMsg = `Oops, category *${filterQuery}* was not found 😊\n\n`;
                errMsg += `Please choose from the categories below:\n`;
                CATEGORIES.forEach((c) => {
                    errMsg += `• *${c.id}*. ${c.displayName.replace(/^\d+\.\s*/, "")}\n`;
                });
                errMsg += `\nExample: */buy 2* or directly type *2*`;
                await ctx.sendText(remoteJid, errMsg);
            } else {
                let errMsg = `Waduh, kategori *${filterQuery}* tidak ditemukan nih kak 😊\n\n`;
                errMsg += `Silakan pilih dari daftar kategori berikut ya:\n`;
                CATEGORIES.forEach((c) => {
                    errMsg += `• *${c.id}*. ${c.displayName.replace(/^\d+\.\s*/, "")}\n`;
                });
                errMsg += `\nContoh: */beli 2* atau langsung ketik *2*`;
                await ctx.sendText(remoteJid, errMsg);
            }
            return;
        }

        ctx.state.startBuyingFlow(remoteJid);
        await ctx.sendText(remoteJid, renderOrderCategoryMenu(userLang));
    },
};

export default menuCommand;
