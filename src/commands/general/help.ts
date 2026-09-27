import type { Command, CommandContext } from "../types";
import { t } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";

export const helpCommand: Command = {
    name: "/bantuan",
    aliases: ["/help"],
    description: "Bantuan dan panduan penggunaan bot toko",
    execute: async ({ remoteJid, sender, isGroup, isAdmin, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;
        await ctx.sendText(remoteJid, `${prefix}${t("helpMessage", userLang, { isAdmin })}`, mentions);
    },
};

export default helpCommand;
