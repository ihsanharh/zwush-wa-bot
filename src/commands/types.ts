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

export type CommandCategory = "order" | "store" | "system" | "support" | "general";

export interface CommandLocaleInfo {
    name?: string;
    description?: string;
}

export interface Command {
    name: string;
    aliases?: string[];
    description: string;
    order?: number;
    adminOnly?: boolean;
    category?: CommandCategory;
    locales?: Record<string, CommandLocaleInfo>;
    execute(cmdCtx: CommandContext): Promise<void>;
}
