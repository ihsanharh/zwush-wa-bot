import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t } from "../../i18n";

export const adminCommand: Command = {
    name: "/admin",
    adminOnly: true,
    order: 10,
    description: "Panel daftar perintah khusus admin toko",
    execute: async ({ remoteJid, sender, userLang, ctx }: CommandContext) => {
        const cleanPhone = extractPhoneNumber(sender);
        const adminGid = ctx.adminLogger?.getAdminGroupJid ? ctx.adminLogger.getAdminGroupJid() : ctx.adminLogger?.getGroupJid();
        const logGid = ctx.adminLogger?.getLogGroupJid ? ctx.adminLogger.getLogGroupJid() : ctx.adminLogger?.getGroupJid();
        const adminStatus = adminGid
            ? t("admin.statusRegisteredWithJid", userLang, { jid: adminGid })
            : t("admin.statusAdminUnregisteredHelp", userLang);
        const logStatus = logGid
            ? t("admin.statusRegisteredWithJid", userLang, { jid: logGid })
            : t("admin.statusLogUnregisteredHelp", userLang);

        const phoneLine = cleanPhone ? t("admin.adminPhoneLine", userLang, { phone: cleanPhone }) : "";

        const out = t("admin.panel", userLang, {
            storeUpper: config.STORE_NAME.toUpperCase(),
            phoneLine,
            adminStatus,
            logStatus
        });

        await ctx.sendText(remoteJid, out);
    },
};

export default adminCommand;
