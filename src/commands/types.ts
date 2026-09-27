import type { BotContext } from "../handlers/message";
import type { Language } from "../i18n";

export interface CommandContext {
    remoteJid: string;
    sender: string;
    args: string[];
    rawText: string;
    isGroup: boolean;
    isAdmin: boolean;
    userLang: Language;
    ctx: BotContext;
}

export interface Command {
    name: string;
    aliases?: string[];
    description: string;
    descriptionEn?: string;
    englishName?: string;
    order?: number;
    adminOnly?: boolean;
    execute(cmdCtx: CommandContext): Promise<void>;
}
