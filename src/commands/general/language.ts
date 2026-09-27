import type { Command, CommandContext } from "../types";
import { t } from "../../i18n";

export const languageCommand: Command = {
    name: "/bahasa",
    aliases: ["/language", "/lang"],
    order: 60,
    description: "Ubah pengaturan bahasa bot (id / en)",
    execute: async ({ remoteJid, args, userLang, ctx }: CommandContext) => {
        const langArg = args[0]?.toLowerCase();
        if (langArg === "en" || langArg === "english") {
            ctx.state.setLanguage(remoteJid, "en");
            await ctx.sendText(remoteJid, t("languageSwitched", "en"));
            return;
        } else if (langArg === "id" || langArg === "indonesia" || langArg === "indo") {
            ctx.state.setLanguage(remoteJid, "id");
            await ctx.sendText(remoteJid, t("languageSwitched", "id"));
            return;
        } else {
            await ctx.sendText(remoteJid, t("currentLanguageStatus", userLang));
            return;
        }
    },
};

export default languageCommand;
