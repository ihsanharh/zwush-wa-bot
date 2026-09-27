import type { Command, CommandContext } from "./types";
import { sendUnrecognizedCommand } from "../utils/messageUtils";

export class CommandRegistry {
    private commands: Map<string, Command> = new Map();
    private uniqueCommands: Set<Command> = new Set();

    public register(command: Command): void {
        const primary = command.name.toLowerCase();
        this.commands.set(primary, command);
        this.uniqueCommands.add(command);

        if (command.aliases) {
            for (const alias of command.aliases) {
                this.commands.set(alias.toLowerCase(), command);
            }
        }
    }

    public get(nameOrAlias: string): Command | undefined {
        const clean = nameOrAlias.trim().toLowerCase();
        return this.commands.get(clean);
    }

    public getAll(): Command[] {
        return Array.from(this.uniqueCommands);
    }

    public async dispatch(commandName: string, ctx: CommandContext): Promise<boolean> {
        const cmd = this.get(commandName);
        if (!cmd) {
            return false;
        }

        if (cmd.adminOnly && !ctx.isAdmin) {
            await sendUnrecognizedCommand(ctx.remoteJid, commandName, ctx.userLang, ctx.ctx, ctx.sender);
            return true;
        }

        try {
            await cmd.execute(ctx);
        } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[CommandRegistry] Error executing ${cmd.name}:`, errorMsg);
            const userMsg = ctx.userLang === "en"
                ? `❌ An error occurred while executing ${commandName}. Please try again later.`
                : `❌ Terjadi kesalahan saat memproses perintah ${commandName}. Mohon coba lagi beberapa saat lagi kak.`;
            await ctx.ctx.sendText(ctx.remoteJid, userMsg);
        }

        return true;
    }
}
