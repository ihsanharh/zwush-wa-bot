import type { Command, CommandContext } from "../types";
import { config } from "../../config";
import { t } from "../../i18n";

export const maintenanceCommand: Command = {
    name: "/maintenance",
    adminOnly: true,
    order: 75,
    category: "system",
    description: "Kontrol mode pemeliharaan sistem (on/off/status)",
    locales: {
        en: {
            name: "/maintenance",
            description: "Control system maintenance mode (on/off/status)"
        }
    },
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        const sub = args[0]?.toLowerCase().trim();

        if (sub === "on" || sub === "aktif" || sub === "enable") {
            ctx.state.setMaintenanceMode(true);
            await ctx.sendText(remoteJid, t("admin.maintenanceEnabled", userLang, { store: config.STORE_NAME }));
            return;
        }

        if (sub === "off" || sub === "nonaktif" || sub === "disable") {
            ctx.state.setMaintenanceMode(false);
            await ctx.sendText(remoteJid, t("admin.maintenanceDisabled", userLang, { store: config.STORE_NAME }));
            return;
        }

        const isEnglish = userLang === "en";
        const isMaint = ctx.state.isMaintenanceMode();
        const statusLabel = isMaint
            ? (isEnglish ? "🔴 ENABLED (ON)" : "🔴 AKTIF (ON)")
            : (isEnglish ? "🟢 DISABLED (OFF - Normal)" : "🟢 NONAKTIF (OFF - Normal)");

        await ctx.sendText(
            remoteJid,
            t("admin.maintenanceStatus", userLang, {
                status: statusLabel,
                storeUpper: config.STORE_NAME.toUpperCase()
            })
        );
    }
};

export default maintenanceCommand;
