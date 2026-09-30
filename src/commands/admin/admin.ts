import type { Command, CommandContext } from "../types";
import { defaultRegistry } from "../registry";
import { config } from "../../config";
import { extractPhoneNumber } from "../../utils/messageUtils";
import { t, type Language } from "../../i18n";

function getCommandDisplayName(cmd: Command, userLang: Language | string): string {
    if (cmd.locales?.[userLang]?.name) {
        return cmd.locales[userLang].name!;
    }
    return cmd.name;
}

function getCommandDesc(cmd: Command, userLang: Language | string): string {
    if (cmd.locales?.[userLang]?.description) {
        return cmd.locales[userLang].description!;
    }
    return cmd.description;
}

export const adminCommand: Command = {
    name: "/admin",
    adminOnly: true,
    order: 5,
    category: "system",
    description: "Panel daftar status & kontrol admin",
    locales: {
        en: {
            name: "/admin",
            description: "Admin status panel & command list"
        }
    },
    execute: async ({ remoteJid, sender, userLang, ctx }: CommandContext) => {
        const isEnglish = userLang === "en";
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

        const headerTitle = isEnglish ? "ADMIN PANEL" : "PANEL ADMIN";
        const statusText = isEnglish ? "Verified Admin ✅" : "Terverifikasi Admin ✅";

        let out = `🛠️ *${headerTitle} ${config.STORE_NAME.toUpperCase()}*\n\n`;
        out += `👤 Status: *${statusText}*\n`;
        if (phoneLine) out += phoneLine;
        out += `👥 Admin Group: *${adminStatus}*\n`;
        out += `📋 Log Group: *${logStatus}*\n\n`;

        const adminCmds = defaultRegistry.getAll().filter((c) => c.adminOnly && c.name !== "/admin");
        adminCmds.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

        const orderCmds = adminCmds.filter((c) => c.category === "order");
        const storeCmds = adminCmds.filter((c) => c.category === "store");
        const systemCmds = adminCmds.filter((c) => c.category === "system" || c.category === "support" || !c.category);

        const formatGroup = (cmds: Command[]) =>
            cmds.map((c) => `• *${getCommandDisplayName(c, userLang)}* : ${getCommandDesc(c, userLang)}`).join("\n");

        if (orderCmds.length > 0) {
            out += (isEnglish ? "*📦 Order Management:*\n" : "*📦 Manajemen Pesanan:*\n") + formatGroup(orderCmds) + "\n\n";
        }
        if (storeCmds.length > 0) {
            out += (isEnglish ? "*🏷️ Store & Balance:*\n" : "*🏷️ Toko & Saldo:*\n") + formatGroup(storeCmds) + "\n\n";
        }
        if (systemCmds.length > 0) {
            out += (isEnglish ? "*⚙️ System & Support:*\n" : "*⚙️ Sistem & Dukungan:*\n") + formatGroup(systemCmds);
        }

        await ctx.sendText(remoteJid, out.trim());
    },
};

export default adminCommand;
