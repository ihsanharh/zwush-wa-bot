import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Command, CommandContext } from "./types";
import { sendUnrecognizedCommand } from "../utils/messageUtils";
import { t } from "../i18n";

export class CommandRegistry {
    private commands: Map<string, Command> = new Map();
    private uniqueCommands: Set<Command> = new Set();
    private loadPromise: Promise<number> | null = null;

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

    public async loadFromDirectory(dirPath?: string): Promise<number> {
        if (this.loadPromise) {
            return this.loadPromise;
        }
        this.loadPromise = this.scanAndLoad(dirPath);
        return this.loadPromise;
    }

    private async scanAndLoad(dirPath?: string): Promise<number> {
        const targetDir = dirPath || (
            typeof (import.meta as any)?.dir === "string"
                ? (import.meta as any).dir
                : path.dirname(fileURLToPath(import.meta.url))
        );

        const filesToLoad: string[] = [];

        const scan = (currentDir: string) => {
            if (!fs.existsSync(currentDir)) return;
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
                        scan(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    const base = path.basename(entry.name, ext);
                    const isTsOrJs = ext === ".ts" || ext === ".js";
                    const isSpecial = base === "index" || base === "registry" || base === "types";
                    const isTestOrDts = entry.name.endsWith(".d.ts") ||
                        entry.name.endsWith(".test.ts") ||
                        entry.name.endsWith(".test.js") ||
                        entry.name.endsWith(".spec.ts") ||
                        entry.name.endsWith(".spec.js");

                    if (isTsOrJs && !isSpecial && !isTestOrDts) {
                        filesToLoad.push(fullPath);
                    }
                }
            }
        };

        scan(targetDir);

        let registeredCount = 0;
        for (const filePath of filesToLoad) {
            try {
                const fileUrl = pathToFileURL(filePath).href;
                const mod = await import(fileUrl);

                let cmd: Command | undefined;
                if (mod.default && typeof mod.default === "object" && typeof mod.default.name === "string" && typeof mod.default.execute === "function") {
                    cmd = mod.default;
                } else {
                    for (const key of Object.keys(mod)) {
                        const candidate = mod[key];
                        if (candidate && typeof candidate === "object" && typeof candidate.name === "string" && typeof candidate.execute === "function") {
                            cmd = candidate;
                            break;
                        }
                    }
                }

                if (cmd) {
                    this.register(cmd);
                    registeredCount++;
                }
            } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`[CommandRegistry] Failed loading command from ${filePath}:`, errorMsg);
            }
        }

        return registeredCount;
    }

    public async dispatch(commandName: string, ctx: CommandContext): Promise<boolean> {
        if (this.loadPromise) {
            await this.loadPromise;
        }

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
            const userMsg = t("commandError", ctx.userLang, { command: commandName });
            await ctx.ctx.sendText(ctx.remoteJid, userMsg);
        }

        return true;
    }
}
