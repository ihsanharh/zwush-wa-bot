import { beforeAll, describe, it, expect, mock } from "bun:test";
import path from "node:path";
import { defaultRegistry } from "../../src/commands/registry";
import { adminCommand } from "../../src/commands/admin/admin";
import { balanceCommand } from "../../src/commands/admin/balance";
import { paidCommand } from "../../src/commands/admin/paid";
import { reprocessCommand } from "../../src/commands/admin/reprocess";
import { setgroupCommand } from "../../src/commands/admin/setgroup";
import { solvedCommand } from "../../src/commands/admin/solved";
import { syncCommand } from "../../src/commands/admin/sync";
import { discountCommand } from "../../src/commands/admin/discount";
import { voucherCommand } from "../../src/commands/admin/voucher";
import { helpCommand } from "../../src/commands/general/help";
import { cancelCommand } from "../../src/commands/general/cancel";
import { StateManager } from "../../src/state";

describe("Bot Commands Bilingual Localization Tests", () => {
    beforeAll(async () => {
        const cmdDir = path.resolve(__dirname, "../../src/commands");
        await defaultRegistry.loadFromDirectory(cmdDir);
    });
    const createMockContext = (lang: "id" | "en" = "id", isAdmin = true) => {
        let sentText = "";
        const state = new StateManager();
        const client: any = {
            retryAllOrders: mock(async () => ({ count: 2, orderIds: ["ORD-1", "ORD-2"] })),
            retryOrder: mock(async (id: string) => ({ orderId: id })),
            markOrderAsPaid: mock(async (id: string) => ({
                orderId: id,
                gamertag: "TestGamer",
                itemName: "Dragon Pet",
                totalNominal: 25000
            })),
            getBotBalance: mock(async () => ({
                gamertag: "HiveBot",
                botStatus: "ONLINE",
                tokens: 1500,
                costumeTokens: 200,
                todayCompleted: 10,
                todayRevenue: 250000,
                pendingPayment: 2,
                giftingQueue: 1,
                insufficientTokens: 0,
                discountPercent: 50,
                activeVouchers: 3
            })),
            syncCatalog: mock(async () => ({ success: true, message: "Sync started" })),
            setStoreDiscount: mock(async () => ({ success: true })),
            getVoucherStatus: mock(async () => ({
                discountPercent: 50,
                vouchers: [
                    { code: "PROMO10", discountType: "PERCENT", discountValue: 10, usedCount: 5, maxUses: 50, active: true }
                ]
            })),
            createVoucher: mock(async () => ({ success: true })),
            deleteVoucher: mock(async () => ({ success: true })),
            cancelOrder: mock(async (id: string) => ({
                orderId: id,
                gamertag: "TestGamer",
                itemName: "Dragon Pet",
                totalNominal: 25000
            }))
        };

        const ctx: any = {
            client,
            state,
            sendText: mock(async (_jid: string, text: string) => {
                sentText = text;
            }),
            sendImage: mock(async () => ({}))
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
                ctx
            })
        };
    };

    it("should display /help in English with English command names and no raw i18n keys", async () => {
        const { getSentText, buildCmdCtx } = createMockContext("en", true);
        await helpCommand.execute(buildCmdCtx([]));

        const text = getSentText();
        expect(text).toContain("HELP");
        expect(text).toContain("• */buy* :");
        expect(text).toContain("• */catalog* :");
        expect(text).toContain("• */history* :");
        expect(text).toContain("• */cancel* :");
        expect(text).toContain("• */balance* :");
        expect(text).not.toContain("help.commandDescriptions");
        expect(text).not.toContain("help.header");
    });

    it("should display /help in Indonesian with Indonesian command names and no raw i18n keys", async () => {
        const { getSentText, buildCmdCtx } = createMockContext("id", true);
        await helpCommand.execute(buildCmdCtx([]));

        const text = getSentText();
        expect(text).toContain("BANTUAN");
        expect(text).toContain("• */beli* :");
        expect(text).toContain("• */katalog* :");
        expect(text).toContain("• */riwayat* :");
        expect(text).toContain("• */batal* :");
        expect(text).toContain("• */saldo* :");
        expect(text).not.toContain("help.commandDescriptions");
    });

    it("should display /admin panel in English and Indonesian properly", async () => {
        const enCtx = createMockContext("en", true);
        await adminCommand.execute(enCtx.buildCmdCtx([]));
        expect(enCtx.getSentText()).toContain("ADMIN PANEL");
        expect(enCtx.getSentText()).toContain("Verified Admin ✅");
        expect(enCtx.getSentText()).not.toContain("admin.panel");

        const idCtx = createMockContext("id", true);
        await adminCommand.execute(idCtx.buildCmdCtx([]));
        expect(idCtx.getSentText()).toContain("PANEL ADMIN");
        expect(idCtx.getSentText()).toContain("Terverifikasi Admin ✅");
        expect(idCtx.getSentText()).not.toContain("admin.panel");
    });

    it("should display /paid in English and Indonesian properly", async () => {
        const enCtx = createMockContext("en", true);
        await paidCommand.execute(enCtx.buildCmdCtx([]));
        expect(enCtx.getSentText()).toContain("MANUAL PAYMENT BYPASS USAGE");

        await paidCommand.execute(enCtx.buildCmdCtx(["ORD-TEST"]));
        expect(enCtx.getSentText()).toContain("PAYMENT MANUALLY VERIFIED");
        expect(enCtx.getSentText()).not.toContain("admin.paid");

        const idCtx = createMockContext("id", true);
        await paidCommand.execute(idCtx.buildCmdCtx([]));
        expect(idCtx.getSentText()).toContain("FORMAT PERINTAH BYPASS PEMBAYARAN");

        await paidCommand.execute(idCtx.buildCmdCtx(["ORD-TEST"]));
        expect(idCtx.getSentText()).toContain("PEMBAYARAN DIVERIFIKASI MANUAL");
        expect(idCtx.getSentText()).not.toContain("admin.paid");
    });

    it("should display /reprocess in English and Indonesian properly", async () => {
        const enCtx = createMockContext("en", true);
        await reprocessCommand.execute(enCtx.buildCmdCtx([]));
        expect(enCtx.getSentText()).toContain("REPROCESS COMPLETE");
        expect(enCtx.getSentText()).toContain("Successfully reprocessed *2 orders*");
        expect(enCtx.getSentText()).not.toContain("admin.reprocess");

        await reprocessCommand.execute(enCtx.buildCmdCtx(["ORD-123"]));
        expect(enCtx.getSentText()).toContain("ORDER #ORD-123 REPROCESSED");

        const idCtx = createMockContext("id", true);
        await reprocessCommand.execute(idCtx.buildCmdCtx([]));
        expect(idCtx.getSentText()).toContain("REPROCESS SELESAI");
        expect(idCtx.getSentText()).toContain("Berhasil memproses ulang *2 pesanan*");
        expect(idCtx.getSentText()).not.toContain("admin.reprocess");
    });

    it("should display /setgroup in English and Indonesian properly", async () => {
        const enCtx = createMockContext("en", true);
        await setgroupCommand.execute(enCtx.buildCmdCtx([], true));
        expect(enCtx.getSentText()).toContain("GROUP SETTINGS");
        expect(enCtx.getSentText()).not.toContain("admin.setgroup");

        await setgroupCommand.execute(enCtx.buildCmdCtx([], false));
        expect(enCtx.getSentText()).toContain("HOW TO REGISTER ADMIN / LOG GROUP");

        const idCtx = createMockContext("id", true);
        await setgroupCommand.execute(idCtx.buildCmdCtx([], true));
        expect(idCtx.getSentText()).toContain("PENGATURAN GRUP");
        expect(idCtx.getSentText()).not.toContain("admin.setgroup");

        await setgroupCommand.execute(idCtx.buildCmdCtx([], false));
        expect(idCtx.getSentText()).toContain("CARA MENDAFTARKAN ADMIN GROUP");
    });

    it("should display /cancel in English and Indonesian properly", async () => {
        const enCtx = createMockContext("en", true);
        await cancelCommand.execute(enCtx.buildCmdCtx(["ORD-ABC"]));
        expect(enCtx.getSentText()).toContain("ORDER CANCELLED BY ADMIN");
        expect(enCtx.getSentText()).not.toContain("cancel.adminCancelled");

        const idCtx = createMockContext("id", true);
        await cancelCommand.execute(idCtx.buildCmdCtx(["ORD-ABC"]));
        expect(idCtx.getSentText()).toContain("PESANAN DIBATALKAN OLEH ADMIN");
        expect(idCtx.getSentText()).not.toContain("cancel.adminCancelled");
    });

    it("should dynamically include new commands registered at runtime without modifying help.ts", async () => {
        defaultRegistry.register({
            name: "/custompromo",
            description: "Dapatkan penawaran promo custom terbaru",
            order: 95,
            locales: {
                en: {
                    name: "/customoffer",
                    description: "Get latest custom promo offers"
                }
            },
            execute: async () => {}
        });

        defaultRegistry.register({
            name: "/fallbackcmd",
            description: "Perintah tanpa locale khusus",
            order: 96,
            execute: async () => {}
        });

        const idCtx = createMockContext("id", false);
        await helpCommand.execute(idCtx.buildCmdCtx([]));
        expect(idCtx.getSentText()).toContain("• */custompromo* : Dapatkan penawaran promo custom terbaru");
        expect(idCtx.getSentText()).toContain("• */fallbackcmd* : Perintah tanpa locale khusus");

        const enCtx = createMockContext("en", false);
        await helpCommand.execute(enCtx.buildCmdCtx([]));
        expect(enCtx.getSentText()).toContain("• */customoffer* : Get latest custom promo offers");
        expect(enCtx.getSentText()).toContain("• */fallbackcmd* : Perintah tanpa locale khusus");
    });
});
