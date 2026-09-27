import { describe, expect, it, mock } from "bun:test";
import { CommandRegistry } from "../../src/commands/registry";
import type { Command, CommandContext } from "../../src/commands/types";

describe("CommandRegistry", () => {
    function createMockCommandContext(overrides: Partial<CommandContext> = {}): CommandContext {
        return {
            remoteJid: "12345@s.whatsapp.net",
            sender: "12345@s.whatsapp.net",
            args: [],
            rawText: "/test",
            isGroup: false,
            isAdmin: false,
            userLang: "id",
            ctx: {
                client: {} as any,
                state: {} as any,
                sendText: mock(async () => {}),
                sendImage: mock(async () => {}),
            },
            ...overrides,
        };
    }

    it("registers and dispatches a command by primary name", async () => {
        const registry = new CommandRegistry();
        let executed = false;

        const cmd: Command = {
            name: "/ping",
            description: "Ping command",
            execute: async () => {
                executed = true;
            },
        };

        registry.register(cmd);
        const dispatched = await registry.dispatch("/ping", createMockCommandContext());

        expect(dispatched).toBe(true);
        expect(executed).toBe(true);
    });

    it("dispatches command via alias", async () => {
        const registry = new CommandRegistry();
        let executedWith: string[] = [];

        const cmd: Command = {
            name: "/beli",
            aliases: ["/buy", "/menu"],
            description: "Buy items",
            execute: async (ctx) => {
                executedWith = ctx.args;
            },
        };

        registry.register(cmd);
        const dispatched = await registry.dispatch("/buy", createMockCommandContext({ args: ["1"] }));

        expect(dispatched).toBe(true);
        expect(executedWith).toEqual(["1"]);
    });

    it("blocks non-admins from running adminOnly commands", async () => {
        const registry = new CommandRegistry();
        let executed = false;

        const cmd: Command = {
            name: "/saldo",
            adminOnly: true,
            description: "Check balance",
            execute: async () => {
                executed = true;
            },
        };

        registry.register(cmd);
        const ctx = createMockCommandContext({ isAdmin: false });
        const dispatched = await registry.dispatch("/saldo", ctx);

        expect(dispatched).toBe(true);
        expect(executed).toBe(false);
        expect(ctx.ctx.sendText).toHaveBeenCalled();
    });

    it("allows admins to run adminOnly commands", async () => {
        const registry = new CommandRegistry();
        let executed = false;

        const cmd: Command = {
            name: "/saldo",
            adminOnly: true,
            description: "Check balance",
            execute: async () => {
                executed = true;
            },
        };

        registry.register(cmd);
        const ctx = createMockCommandContext({ isAdmin: true });
        const dispatched = await registry.dispatch("/saldo", ctx);

        expect(dispatched).toBe(true);
        expect(executed).toBe(true);
    });

    it("returns false for unknown commands", async () => {
        const registry = new CommandRegistry();
        const dispatched = await registry.dispatch("/unknown", createMockCommandContext());
        expect(dispatched).toBe(false);
    });
});
