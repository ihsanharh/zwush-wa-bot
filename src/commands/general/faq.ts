import type { Command, CommandContext } from "../types";
import { t } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const faqCommand: Command = {
    name: "/faq",
    aliases: ["/tanya"],
    description: "Pertanyaan yang sering diajukan seputar toko",
    execute: async ({ remoteJid, sender, isGroup, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;
        await ctx.sendText(remoteJid, `${prefix}${t("faqMessage", userLang)}`, mentions);
    },
};

export default faqCommand;
