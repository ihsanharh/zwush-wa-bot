import type { Command, CommandContext } from "../types";
import { defaultRegistry } from "../registry";
import { t, type Language } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";

function getCommandDesc(cmd: Command, displayName: string, userLang: Language): string {
    const key1 = `help.commandDescriptions.${displayName}`;
    const t1 = t(key1, userLang);
    if (t1 && t1 !== key1) return t1;

    const key2 = `help.commandDescriptions.${cmd.name}`;
    const t2 = t(key2, userLang);
    if (t2 && t2 !== key2) return t2;

    return userLang === "en" ? (cmd.descriptionEn || cmd.description) : cmd.description;
}

export const helpCommand: Command = {
    name: "/bantuan",
    aliases: ["/help"],
    englishName: "/help",
    order: 90,
    description: "Bantuan dan panduan penggunaan bot toko",
    descriptionEn: "View bot commands guide and help",
    execute: async ({ remoteJid, sender, isGroup, isAdmin, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;

        const allCommands = defaultRegistry.getAll();
        const generalCmds = allCommands.filter((c) => !c.adminOnly);
        const adminCmds = allCommands.filter((c) => c.adminOnly);

        const sortCommands = (a: Command, b: Command) => {
            const orderA = a.order ?? 999;
            const orderB = b.order ?? 999;
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name);
        };

        generalCmds.sort(sortCommands);
        adminCmds.sort(sortCommands);

        let out = prefix + t("help.header", userLang);

        // Format general commands dynamically
        for (const cmd of generalCmds) {
            const displayName = userLang === "en" ? (cmd.englishName || cmd.name) : cmd.name;
            const desc = getCommandDesc(cmd, displayName, userLang);
            out += `• *${displayName}* : ${desc}\n`;
        }

        // Navigation shortcuts (b / k or c / b)
        out += "\n" + t("help.navigationShortcuts", userLang);

        // Format admin commands dynamically if caller is admin
        if (isAdmin && adminCmds.length > 0) {
            out += t("help.adminSectionHeader", userLang);
            for (const cmd of adminCmds) {
                const displayName = userLang === "en" ? (cmd.englishName || cmd.name) : cmd.name;
                const desc = getCommandDesc(cmd, displayName, userLang);
                out += `• *${displayName}* : ${desc}\n`;
            }
            out += "\n";
        }

        // Footer instructing user on how to reach admin support
        out += t("help.footer", userLang);

        await ctx.sendText(remoteJid, out, mentions);
    },
};

export default helpCommand;
