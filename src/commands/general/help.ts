import type { Command, CommandContext } from "../types";
import { defaultRegistry } from "../registry";
import { t } from "../../i18n";
import { extractPhoneNumber } from "../../utils/messageUtils";

const GENERAL_ORDER = [
    "/beli",
    "/buy",
    "/katalog",
    "/catalog",
    "/status",
    "/riwayat",
    "/history",
    "/faq",
    "/bahasa",
    "/language",
    "/support",
    "/cs",
    "/batal",
    "/cancel",
    "/bantuan",
    "/help"
];

const ADMIN_ORDER = [
    "/admin",
    "/saldo",
    "/balance",
    "/sync",
    "/synckatalog",
    "/reprocess",
    "/setgroup",
    "/setdiskon",
    "/setdiscount",
    "/voucher",
    "/paid",
    "/solved",
    "/solve"
];

export const helpCommand: Command = {
    name: "/bantuan",
    aliases: ["/help"],
    description: "Bantuan dan panduan penggunaan bot toko",
    execute: async ({ remoteJid, sender, isGroup, isAdmin, userLang, ctx }: CommandContext) => {
        const senderPhone = isGroup && sender ? extractPhoneNumber(sender) : "";
        const prefix = senderPhone ? `@${senderPhone}\n\n` : "";
        const mentions = isGroup && sender ? [sender] : undefined;

        const allCommands = defaultRegistry.getAll();
        const generalCmds = allCommands.filter((c) => !c.adminOnly);
        const adminCmds = allCommands.filter((c) => c.adminOnly);

        generalCmds.sort((a, b) => {
            const idxA = GENERAL_ORDER.indexOf(a.name);
            const idxB = GENERAL_ORDER.indexOf(b.name);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.name.localeCompare(b.name);
        });

        adminCmds.sort((a, b) => {
            const idxA = ADMIN_ORDER.indexOf(a.name);
            const idxB = ADMIN_ORDER.indexOf(b.name);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.name.localeCompare(b.name);
        });

        let out = prefix + t("help.header", userLang);

        // Format general commands dynamically
        for (const cmd of generalCmds) {
            const displayName = userLang === "en" && cmd.aliases && cmd.aliases.length > 0
                ? (cmd.aliases.find((a) => !a.startsWith("/b") && !a.startsWith("/r")) || cmd.aliases[0] || cmd.name)
                : cmd.name;

            const desc = t(`help.commandDescriptions.${displayName}`, userLang)
                || t(`help.commandDescriptions.${cmd.name}`, userLang)
                || cmd.description;

            out += `• *${displayName}* : ${desc}\n`;
        }

        // Navigation shortcuts (b / k or c / b)
        out += "\n" + t("help.navigationShortcuts", userLang);

        // Format admin commands dynamically if caller is admin
        if (isAdmin && adminCmds.length > 0) {
            out += t("help.adminSectionHeader", userLang);
            for (const cmd of adminCmds) {
                const displayName = userLang === "en" && cmd.aliases && cmd.aliases.length > 0
                    ? (cmd.aliases[0] || cmd.name)
                    : cmd.name;

                const desc = t(`help.commandDescriptions.${displayName}`, userLang)
                    || t(`help.commandDescriptions.${cmd.name}`, userLang)
                    || cmd.description;

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
