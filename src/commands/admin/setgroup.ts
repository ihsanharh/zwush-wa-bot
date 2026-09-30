import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { t } from "../../i18n";

export const setgroupCommand: Command = {
    name: "/setgroup",
    adminOnly: true,
    order: 65,
    category: "system",
    description: "Daftarkan grup obrolan sebagai Admin atau Log Group",
    locales: {
        en: {
            name: "/setgroup",
            description: "Register chat group as Admin or Log Group"
        }
    },
    execute: async ({ remoteJid, args, isGroup, userLang, ctx }: CommandContext) => {
        const sub = args[0]?.toLowerCase();
        const targetJid = args[1]?.trim();

        if (isGroup) {
            if (sub === "admin") {
                if (ctx.adminLogger) {
                    ctx.adminLogger.setAdminGroupJid(remoteJid);
                    await ctx.sendText(
                        remoteJid,
                        t("admin.setgroupAdminRegistered", userLang, { store: config.STORE_NAME })
                    );
                }
                return;
            }

            if (sub === "log" || sub === "logs") {
                if (ctx.adminLogger) {
                    ctx.adminLogger.setLogGroupJid(remoteJid);
                    await ctx.sendText(
                        remoteJid,
                        t("admin.setgroupLogRegistered", userLang, { store: config.STORE_NAME })
                    );
                }
                return;
            }

            const adminGid = ctx.adminLogger?.getAdminGroupJid ? ctx.adminLogger.getAdminGroupJid() : ctx.adminLogger?.getGroupJid();
            const logGid = ctx.adminLogger?.getLogGroupJid ? ctx.adminLogger.getLogGroupJid() : ctx.adminLogger?.getGroupJid();
            const statusAdmin = adminGid === remoteJid
                ? t("admin.statusRegisteredThisGroup", userLang)
                : (adminGid ? t("admin.statusRegisteredWithJid", userLang, { jid: adminGid }) : t("admin.statusUnregistered", userLang));
            const statusLog = logGid === remoteJid
                ? t("admin.statusRegisteredThisGroup", userLang)
                : (logGid ? t("admin.statusRegisteredWithJid", userLang, { jid: logGid }) : t("admin.statusUnregistered", userLang));

            await ctx.sendText(
                remoteJid,
                t("admin.setgroupStatus", userLang, {
                    storeUpper: config.STORE_NAME.toUpperCase(),
                    statusAdmin,
                    statusLog
                })
            );
            return;
        }

        // Private chat invocations: /setgroup <role> <jid>
        if (sub === "admin" && targetJid && targetJid.endsWith("@g.us")) {
            if (ctx.adminLogger) {
                ctx.adminLogger.setAdminGroupJid(targetJid);
                await ctx.sendText(
                    remoteJid,
                    t("admin.setgroupRegistered", userLang, { role: "Admin Command Group", jid: targetJid })
                );
            }
        } else if ((sub === "log" || sub === "logs") && targetJid && targetJid.endsWith("@g.us")) {
            if (ctx.adminLogger) {
                ctx.adminLogger.setLogGroupJid(targetJid);
                await ctx.sendText(
                    remoteJid,
                    t("admin.setgroupRegistered", userLang, { role: "Transaction Log Group", jid: targetJid })
                );
            }
        } else if (sub && sub.endsWith("@g.us")) {
            // Legacy: /setgroup <JID>
            if (ctx.adminLogger) {
                ctx.adminLogger.setAdminGroupJid(sub);
                ctx.adminLogger.setGroupJid(sub);
                await ctx.sendText(
                    remoteJid,
                    t("admin.setgroupRegistered", userLang, { role: "Admin Group", jid: sub })
                );
            }
        } else {
            await ctx.sendText(remoteJid, t("admin.setgroupHelp", userLang));
        }
    },
};

export default setgroupCommand;
