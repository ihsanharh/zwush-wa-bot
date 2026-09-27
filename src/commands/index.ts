import path from "node:path";
import { fileURLToPath } from "node:url";
import { CommandRegistry } from "./registry";
import type { Command } from "./types";

export const defaultRegistry = new CommandRegistry();

const commandsDir = typeof (import.meta as any)?.dir === "string"
    ? (import.meta as any).dir
    : path.dirname(fileURLToPath(import.meta.url));

// Automatically discover and load all command modules from runtime directory
await defaultRegistry.loadFromDirectory(commandsDir);

export function getAllCommands(): Command[] {
    return defaultRegistry.getAll();
}

export const allCommands: Command[] = defaultRegistry.getAll();

export * from "./types";
export * from "./registry";
