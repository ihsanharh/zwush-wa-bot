import type { Command, CommandContext } from "../types";
import { t } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const faqCommand: Command = {
    name: "/faq",
    aliases: ["/tanya"],
    order: 50,
    category: "general",
    description: "Tanya jawab pembayaran QRIS & pengiriman item",
    locales: {
        en: {
            name: "/faq",
            description: "Frequently asked questions about payment & delivery"
        }
    },
    execute: async ({ remoteJid, sender, isGroup, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;
        await ctx.sendText(remoteJid, `${prefix}${t("faqMessage", userLang)}`, mentions);
    },
};

export default faqCommand;
