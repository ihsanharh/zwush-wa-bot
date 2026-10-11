import { describe, it, expect, mock } from "bun:test";
import { balanceCommand } from "../../src/commands/admin/balance";
import { syncCommand } from "../../src/commands/admin/sync";
import { maintenanceCommand } from "../../src/commands/admin/maintenance";
import { StateManager } from "../../src/state";

describe("Bot Commands Bilingual Localization Tests", () => {
    const createMockContext = (lang: "id" | "en" = "id", isAdmin = true) => {
        let sentText = "";
        const state = new StateManager();
        const client: any = {
            getBalance: mock(async () => ({
                bot: {
                    gamertag: "HiveBot",
                    tokens: 1500,
                    costumeTokens: 200,
                    status: "ONLINE",
                },
                summary: {
                    todayCompleted: 10,
                    todayRevenue: 250000,
                    pendingPayment: 2,
                    giftingQueue: 1,
                    insufficientTokens: 0,
                    discountPercent: 50,
                    activeVouchers: 3,
                },
            })),
            syncCatalog: mock(async () => ({ success: true })),
        };

        const ctx: any = {
            client,
            state,
            sendText: mock(async (_jid: string, text: string) => {
                sentText = text;
            }),
            sendImage: mock(async () => ({})),
        };

        return {
            ctx,
            client,
            state,
            getSentText: () => sentText,
            buildCmdCtx: (args: string[] = [], isGroup = false) => ({
                remoteJid: "user123@s.whatsapp.net",
                sender: "user123@s.whatsapp.net",
                args,
                rawText: args.join(" "),
                isGroup,
                isAdmin,
                userLang: lang,
                ctx,
            }),
        };
    };

    it("should display /saldo (/balance) in English and Indonesian properly", async () => {
        const enCtx = createMockContext("en", true);
        await balanceCommand.execute(enCtx.buildCmdCtx([]));
        expect(enCtx.getSentText()).toContain("ONLINE");
        expect(enCtx.getSentText()).toContain("Tokens");

        const idCtx = createMockContext("id", true);
        await balanceCommand.execute(idCtx.buildCmdCtx([]));
        expect(idCtx.getSentText()).toContain("ONLINE");
        expect(idCtx.getSentText()).toContain("Token");
    });

    it("should display /sync in English and Indonesian properly", async () => {
        const enCtx = createMockContext("en", true);
        await syncCommand.execute(enCtx.buildCmdCtx([]));
        expect(enCtx.getSentText()).toContain("CATALOG SYNC INITIATED");

        const idCtx = createMockContext("id", true);
        await syncCommand.execute(idCtx.buildCmdCtx([]));
        expect(idCtx.getSentText()).toContain("SINKRONISASI KATALOG DIMULAI");
    });

    it("should display /maintenance in English and Indonesian properly", async () => {
        const enCtx = createMockContext("en", true);
        await maintenanceCommand.execute(enCtx.buildCmdCtx(["on"]));
        expect(enCtx.getSentText()).toContain("ENABLED");

        const idCtx = createMockContext("id", true);
        await maintenanceCommand.execute(idCtx.buildCmdCtx(["on"]));
        expect(idCtx.getSentText()).toContain("DIAKTIFKAN");
    });
});
