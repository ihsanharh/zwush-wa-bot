import { describe, expect, it, mock } from "bun:test";
import {
    handleIncomingMessage,
    extractMessageText,
    resolveCategory,
    CATEGORIES,
    type BotContext
} from "../src/handlers/message";
import { StateManager } from "../src/state";
import type { CatalogItem } from "../src/types";
import type { CoreClient } from "../src/coreClient";

describe("Message Handler Router", () => {
    const dummyItems: CatalogItem[] = [
        {
            id: "1",
            name: "Ultimate Rank",
            category: "Main Store",
            tokenCost: 22,
            minecoins: 1450,
            originalPrice: 110000,
            rupiahPrice: 55000,
            discountPercent: 50,
            imageUrl: "https://cdn.playhive.com/icons/hub/gifts/bundles.png",
            active: true
        },
        {
            id: "2",
            name: "Dragon Pet",
            category: "Regular Pet",
            tokenCost: 10,
            minecoins: 660,
            originalPrice: 50000,
            rupiahPrice: 25000,
            discountPercent: 50,
            imageUrl: "https://cdn.playhive.com/avatars/pet-dragon.png",
            active: true
        },
        {
            id: "3",
            name: "Ghost Pet",
            category: "Regular Pet",
            tokenCost: 10,
            minecoins: 660,
            originalPrice: 50000,
            rupiahPrice: 25000,
            discountPercent: 50,
            imageUrl: null,
            active: true
        }
    ];

    function createMockContext() {
        const sentTexts: string[] = [];
        const sentImages: Array<{ buffer: Buffer; caption: string }> = [];

        const mockClient = {
            getCatalog: mock(async () => dummyItems),
            createOrder: mock(async () => ({
                success: true,
                orderId: "ord_1",
                totalNominal: 25012,
                qrisString: "00020101021226570014ID.CO.QRIS.WWW5802ID5909ZwushStore6304ABCD",
                expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
            })),
            getOrderStatus: mock(async (id: string) => ({
                id,
                gamertag: "Viosca",
                itemName: "Dragon Pet",
                status: "QUEUED" as const,
                totalNominal: 25012
            })),
            getOrderQrPng: mock(async (_id: string) => {
                return Buffer.from([0x89, 0x50, 0x4e, 0x47]);
            }),
            getUserOrders: mock(async (_jid: string) => [
                {
                    id: "ord_user_1",
                    gamertag: "Viosca",
                    itemName: "Dragon Pet",
                    status: "QUEUED" as const,
                    totalNominal: 25012
                }
            ]),
            retryOrder: mock(async (id: string) => ({
                success: true,
                orderId: id,
                status: "QUEUED" as const
            })),
            retryAllOrders: mock(async () => ({
                success: true,
                count: 2,
                orderIds: ["ord_1", "ord_2"]
            }))
        };

        const loggedOrders: Array<Record<string, unknown>> = [];
        const mockAdminLogger = {
            groupJid: "120363@g.us",
            getGroupJid: () => mockAdminLogger.groupJid,
            setGroupJid: (jid: string) => {
                mockAdminLogger.groupJid = jid;
            },
            logNewOrder: mock(async (order: Record<string, unknown>) => {
                loggedOrders.push(order);
            }),
            updateOrderStatus: mock(async () => {})
        };

        const sentTextEvents: Array<{ jid: string; text: string; mentions?: string[] }> = [];

        const ctx: BotContext = {
            client: mockClient as unknown as CoreClient,
            adminNumber: "628123456789",
            adminLogger: mockAdminLogger as any,
            state: new StateManager(),
            sendText: mock(async (jid: string, text: string, mentions?: string[]) => {
                sentTexts.push(text);
                sentTextEvents.push({ jid, text, mentions });
            }),
            sendImage: mock(async (_jid: string, buffer: Buffer, caption: string) => {
                sentImages.push({ buffer, caption });
                return { key: { id: "qr_key_123", remoteJid: _jid } };
            })
        };

        return { ctx, sentTexts, sentTextEvents, sentImages, loggedOrders, mockClient, mockAdminLogger };
    }

    it("should ignore messages from groups or newsletters", async () => {
        const { ctx, sentTexts, sentImages } = createMockContext();
        await handleIncomingMessage("12345-67890@g.us", false, "/menu", ctx);
        await handleIncomingMessage("news@newsletter", false, "/menu", ctx);
        expect(sentTexts.length).toBe(0);
        expect(sentImages.length).toBe(0);
    });

    it("should respond to /menu with friendly redirect to /beli category menu", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "/menu", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("digabung ke */beli*");
        expect(sentTexts[0]).toContain("ZWUSH STORE — KATALOG & PEMESANAN");
        expect(sentTexts[0]).toContain("*1.* 👑 Main Store & Ranks");
        expect(sentTexts[0]).toContain("*2.* 🐾 Pets");
        expect(sentTexts[0]).toContain("Ketik nomor kategori (*1 - 6*)");
    });

    it("should display category poster and items when user selects category from idle (e.g. '2' or '/beli 2')", async () => {
        const { ctx, sentTexts, sentImages } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "2", ctx);
        // Either sent as a poster image or as formatted text with items
        const hasContent = sentImages.length > 0 || sentTexts.length > 0;
        expect(hasContent).toBe(true);
        if (sentImages.length > 0) {
            expect(sentImages[0]?.caption).toContain("PETS");
        } else {
            expect(sentTexts[0]).toContain("PETS");
        }
    });

    it("should validate invalid category on /beli <query>", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "/beli 99", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("tidak ditemukan nih kak");
        expect(sentTexts[0]).toContain("1");
    });

    it("should respond to natural greetings when idle", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "halo", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("Selamat datang di *Zwush Store*");
        expect(sentTexts[0]).toContain("*/beli*");
    });

    it("should execute step-by-step /beli flow with validation at every step", async () => {
        const { ctx, sentTexts, sentImages } = createMockContext();
        const jid = "user@s.whatsapp.net";

        // Step 1: /beli -> sends friendly category prompt
        await handleIncomingMessage(jid, false, "/beli", ctx);
        expect(sentTexts[0]).toContain("ZWUSH STORE — KATALOG & PEMESANAN");
        expect(sentTexts[0]).toContain("Ketik nomor kategori (*1 - 6*)");

        // Validation test in AWAITING_CATEGORY: invalid category
        await handleIncomingMessage(jid, false, "99", ctx);
        expect(sentTexts[1]).toContain("nomor kategorinya belum tepat");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");

        // Valid category: Choose 2 (Pets) -> sends category poster image
        await handleIncomingMessage(jid, false, "2", ctx);
        const hasCategoryPrompt = sentImages.some((img) => img.caption.includes("KATALOG: 2. 🐾 PETS") || img.caption.includes("PILIH ITEM")) ||
            sentTexts.some((txt) => txt.includes("PILIH ITEM"));
        expect(hasCategoryPrompt).toBe(true);
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_ITEM");

        // Validation test in AWAITING_ITEM: invalid item number
        await handleIncomingMessage(jid, false, "999", ctx);
        expect(sentTexts[sentTexts.length - 1]).toContain("pilihan itemnya belum sesuai");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_ITEM");

        // Valid item choice: 1 (Dragon Pet with image) -> sends item preview image
        await handleIncomingMessage(jid, false, "1", ctx);
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_GAMERTAG");
        const hasPreview = sentImages.some((img) => img.caption.includes("Kamu memilih")) ||
            sentTexts.some((txt) => txt.includes("Kamu memilih"));
        expect(hasPreview).toBe(true);

        // Validation test in AWAITING_GAMERTAG: gamertag too short (<3 chars)
        await handleIncomingMessage(jid, false, "ab", ctx);
        expect(sentTexts[sentTexts.length - 1]).toContain("Gamertag tidak valid");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_GAMERTAG");

        // Valid gamertag
        await handleIncomingMessage(jid, false, "Epic Gamer 123", ctx);
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CONFIRMATION");
        expect(sentTexts[sentTexts.length - 1]).toContain("KONFIRMASI PESANAN");
        expect(sentTexts[sentTexts.length - 1]).toContain("Epic Gamer 123");
        expect(sentTexts[sentTexts.length - 1]).toContain("TIDAK BISA DIBATALKAN ATAU DI-REFUND");
        expect(sentTexts[sentTexts.length - 1]).toContain("The Hive sendiri");

        // Validation test in AWAITING_CONFIRMATION: non-YA reply
        await handleIncomingMessage(jid, false, "halo?", ctx);
        expect(sentTexts[sentTexts.length - 1]).toContain("Balas *YA*");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CONFIRMATION");

        // Confirm with YA
        await handleIncomingMessage(jid, false, "YA", ctx);
        expect(sentImages.length).toBeGreaterThanOrEqual(1);
        const lastImage = sentImages[sentImages.length - 1]!;
        expect(lastImage.caption).toContain("INVOICE PEMBAYARAN");
        expect(lastImage.caption).toContain("Rp 25.012");
        expect(ctx.state.getSession(jid).step).toBe("IDLE");
    });

    it("should support back navigation with 'k' or 'kembali'", async () => {
        const { ctx, sentTexts, sentImages } = createMockContext();
        const jid = "user@s.whatsapp.net";

        // Start buying, pick category 2
        await handleIncomingMessage(jid, false, "/beli 2", ctx);
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_ITEM");

        // Go back to category menu using 'k'
        await handleIncomingMessage(jid, false, "k", ctx);
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");
        expect(sentTexts[sentTexts.length - 1]).toContain("Kembali ke pilihan kategori");
    });

    it("should allow testing all commands from self (fromMe: true)", async () => {
        const { ctx, sentTexts, sentImages } = createMockContext();
        const jid = "my-bot@s.whatsapp.net";

        await handleIncomingMessage(jid, true, "/beli", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("ZWUSH STORE — KATALOG & PEMESANAN");

        // Should not be dropped even with fromMe: true when active in flow
        await handleIncomingMessage(jid, true, "2", ctx);
        const hasPrompt = sentImages.some((img) => img.caption.includes("KATALOG") || img.caption.includes("PILIH ITEM")) ||
            sentTexts.some((txt) => txt.includes("PILIH ITEM"));
        expect(hasPrompt).toBe(true);
    });

    it("should cancel buying flow immediately when user replies 'b' or 'batal'", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "user@s.whatsapp.net";

        await handleIncomingMessage(jid, false, "/beli", ctx);
        await handleIncomingMessage(jid, false, "b", ctx);

        expect(sentTexts[1]?.includes("dibatalkan")).toBe(true);
        expect(ctx.state.getSession(jid).step).toBe("IDLE");
    });

    it("should resolve category names and numbers correctly", () => {
        expect(resolveCategory("1", CATEGORIES)?.dbCategory).toBe("Main Store");
        expect(resolveCategory("2. 🐾 Pets", CATEGORIES)?.dbCategory).toBe("Regular Pet");
        expect(resolveCategory("mount", CATEGORIES)?.dbCategory).toBe("Regular Mount");
        expect(resolveCategory("hats", CATEGORIES)?.dbCategory).toBe("Hats");
        expect(resolveCategory("unknown", CATEGORIES)).toBeUndefined();
    });

    it("should extract text from plain, extended, and ephemeral message envelopes", () => {
        expect(extractMessageText({ conversation: "halo" })).toBe("halo");
        expect(extractMessageText({ extendedTextMessage: { text: "halo ext" } })).toBe("halo ext");
        expect(extractMessageText({ ephemeralMessage: { message: { conversation: "halo eph" } } })).toBe("halo eph");
        expect(extractMessageText({ viewOnceMessage: { message: { conversation: "halo once" } } })).toBe("halo once");
        expect(extractMessageText({ imageMessage: { caption: "halo img" } })).toBe("halo img");
        expect(extractMessageText(null)).toBe("");
    });

    it("should auto-map user orders on /status without arguments", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "/status", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("STATUS PESANAN #ord_user_1");
        expect(sentTexts[0]).toContain("Dragon Pet");
    });

    it("should display order history on /riwayat", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "/riwayat", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("RIWAYAT PESANAN");
        expect(sentTexts[0]).toContain("Dragon Pet");
    });

    it("should display short and friendly FAQ on /faq", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "/faq", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("FAQ & CARA PEMBAYARAN");
        expect(sentTexts[0]).toContain("QRIS");
    });

    it("should allow admin to reprocess all failing orders with /reprocess", async () => {
        const { ctx, sentTexts } = createMockContext();
        // admin number
        await handleIncomingMessage("628123456789@s.whatsapp.net", false, "/reprocess", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("REPROCESS SELESAI");
        expect(sentTexts[0]).toContain("2 pesanan");
    });

    it("should allow admin to reprocess with multi-device suffix JID (:1, :0)", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("628123456789:2@s.whatsapp.net", false, "/reprocess", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("REPROCESS SELESAI");
    });

    it("should allow admin to run commands when fromMe is true", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("anyone@s.whatsapp.net", true, "/reprocess", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("REPROCESS SELESAI");
    });

    it("should match admin number across 08 and 628 prefixes", async () => {
        const { ctx, sentTexts } = createMockContext();
        ctx.adminNumber = "08123456789";
        await handleIncomingMessage("628123456789:0@s.whatsapp.net", false, "/reprocess", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("REPROCESS SELESAI");
    });

    it("should match admin number when configured with 8... prefix without leading zero or 62", async () => {
        const { ctx, sentTexts } = createMockContext();
        ctx.adminNumber = "8123456789";
        await handleIncomingMessage("628123456789:1@s.whatsapp.net", false, "/admin", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("PANEL ADMIN");
    });

    it("should show admin panel on /admin for admin users", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("628123456789@s.whatsapp.net", false, "/admin", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("PANEL ADMIN");
        expect(sentTexts[0]).toContain("Terverifikasi Admin");
    });

    it("should allow admin to register group from private chat with /setgroup <jid>", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("628123456789@s.whatsapp.net", false, "/setgroup 120363000000000000@g.us", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("Berhasil mendaftarkan Admin Group");
        expect(ctx.adminLogger?.getGroupJid()).toBe("120363000000000000@g.us");
    });

    it("should show helpful guide when /setgroup is run in private chat without arguments", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("628123456789@s.whatsapp.net", false, "/setgroup", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("CARA MENDAFTARKAN ADMIN GROUP");
    });

    it("should allow admin to reprocess specific order with /reprocess <ID>", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("628123456789@s.whatsapp.net", false, "/reprocess ord_user_1", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("PESANAN #ord_user_1 DIPROSES ULANG");
    });

    it("should treat admin commands as unrecognized for non-admins in private chat", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("buyer@s.whatsapp.net", false, "/reprocess", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("tidak dikenali");

        await handleIncomingMessage("buyer@s.whatsapp.net", false, "/admin", ctx);
        expect(sentTexts.length).toBe(2);
        expect(sentTexts[1]).toContain("tidak dikenali");
    });

    it("should respond with unknown command for admin commands from non-admins in group chats", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("120363000@g.us", false, "/reprocess", ctx, "buyer@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("tidak dikenali");
        await handleIncomingMessage("120363000@g.us", false, "/admin", ctx, "buyer@s.whatsapp.net");
        expect(sentTexts.length).toBe(2);
        expect(sentTexts[1]).toContain("tidak dikenali");
        await handleIncomingMessage("120363000@g.us", false, "/setgroup", ctx, "buyer@s.whatsapp.net");
        expect(sentTexts.length).toBe(3);
        expect(sentTexts[2]).toContain("tidak dikenali");
    });

    it("should not recreate session when spamming /buy while already active", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "spamuser@s.whatsapp.net";

        // First /buy starts the session
        await handleIncomingMessage(jid, false, "/buy", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("KATALOG & PEMESANAN");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");

        // Second /buy should warn instead of recreating
        await handleIncomingMessage(jid, false, "/buy", ctx);
        expect(sentTexts.length).toBe(2);
        expect(sentTexts[1]).toContain("Sesi belanja kakak sudah aktif");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");
    });

    it("should only cancel once when spamming Batal", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "canceluser@s.whatsapp.net";

        // Start order flow
        await handleIncomingMessage(jid, false, "/buy", ctx);
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");
        sentTexts.length = 0;

        // First batal cancels
        await handleIncomingMessage(jid, false, "batal", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("pemesanan telah dibatalkan");
        expect(ctx.state.getSession(jid).step).toBe("IDLE");

        // Second batal immediately after should be ignored, not spam responses
        await handleIncomingMessage(jid, false, "batal", ctx);
        expect(sentTexts.length).toBe(1);

        // Third /batal immediately after should also be throttled
        await handleIncomingMessage(jid, false, "/batal", ctx);
        expect(sentTexts.length).toBe(1);
    });

    it("should display admin only category in /bantuan when called by admin", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("628123456789@s.whatsapp.net", false, "/bantuan", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("PERINTAH KHUSUS ADMIN");
        expect(sentTexts[0]).toContain("/admin");
        expect(sentTexts[0]).toContain("/reprocess");
        expect(sentTexts[0]).toContain("/setgroup");
    });

    it("should not display admin commands in /bantuan when called by non-admin", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("buyer@s.whatsapp.net", false, "/bantuan", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).not.toContain("PERINTAH KHUSUS ADMIN");
    });

    it("should query specific order with /status <ID>", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("buyer@s.whatsapp.net", false, "/status ord_123", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("STATUS PESANAN #ord_123");
        expect(sentTexts[0]).toContain("Dragon Pet");
    });

    it("should invite user to /beli when /status finds no orders", async () => {
        const { ctx, sentTexts, mockClient } = createMockContext();
        mockClient.getUserOrders = mock(async () => []);
        await handleIncomingMessage("newbuyer@s.whatsapp.net", false, "/status", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("belum memiliki riwayat pesanan");
        expect(sentTexts[0]).toContain("/beli");
    });

    it("should invite user to /beli when /riwayat finds no orders", async () => {
        const { ctx, sentTexts, mockClient } = createMockContext();
        mockClient.getUserOrders = mock(async () => []);
        await handleIncomingMessage("newbuyer@s.whatsapp.net", false, "/riwayat", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("Belum ada riwayat pesanan");
        expect(sentTexts[0]).toContain("/beli");
    });

    it("should allow admin to register group with /setgroup", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        await handleIncomingMessage("98765-4321@g.us", false, "/setgroup", ctx, "628123456789@s.whatsapp.net");
        expect(mockAdminLogger.groupJid).toBe("98765-4321@g.us");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("berhasil didaftarkan sebagai Admin Group");
    });

    it("should allow reprocess inside registered admin group", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.groupJid = "120363@g.us";
        await handleIncomingMessage("120363@g.us", false, "/reprocess", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("REPROCESS SELESAI");
    });

    it("should log new order to admin group and record QR message key on YA confirmation", async () => {
        const { ctx, loggedOrders } = createMockContext();
        const jid = "buyer@s.whatsapp.net";

        // Walk through buying flow to confirmation
        await handleIncomingMessage(jid, false, "/beli", ctx);
        await handleIncomingMessage(jid, false, "2", ctx); // Pets
        await handleIncomingMessage(jid, false, "1", ctx); // Item 1 (Dragon Pet)
        await handleIncomingMessage(jid, false, "Steve123", ctx); // Gamertag
        await handleIncomingMessage(jid, false, "YA", ctx); // Confirm

        expect(loggedOrders.length).toBe(1);
        expect(loggedOrders[0]?.orderId).toBe("ord_1");
        expect(loggedOrders[0]?.gamertag).toBe("Steve123");
        expect(ctx.state.getQrMessageKey(jid)).toEqual({ id: "qr_key_123", remoteJid: jid });
    });

    it("should switch language with /language en and /bahasa id", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "user_switch@s.whatsapp.net";

        // Switch to English
        await handleIncomingMessage(jid, false, "/language en", ctx);
        expect(ctx.state.getLanguage(jid)).toBe("en");
        expect(sentTexts[0]).toContain("Language successfully switched to *English*");

        // Switch back to Indonesian
        await handleIncomingMessage(jid, false, "/bahasa id", ctx);
        expect(ctx.state.getLanguage(jid)).toBe("id");
        expect(sentTexts[1]).toContain("Bahasa berhasil diubah ke *Bahasa Indonesia*");
    });

    it("should display cross-language hint when /buy is run in id mode", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "user_id@s.whatsapp.net";
        await handleIncomingMessage(jid, false, "/buy", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("*/beli*");
        expect(sentTexts[0]).toContain("*/bahasa en*");
    });

    it("should display cross-language hint when /beli is run in en mode", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "user_en@s.whatsapp.net";
        ctx.state.setLanguage(jid, "en");

        await handleIncomingMessage(jid, false, "/beli", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("*/buy*");
        expect(sentTexts[0]).toContain("*/language id*");
    });

    it("should complete entire buying flow in English when user is in en mode", async () => {
        const { ctx, sentTexts, sentImages } = createMockContext();
        const jid = "buyer_en@s.whatsapp.net";
        ctx.state.setLanguage(jid, "en");

        await handleIncomingMessage(jid, false, "/buy", ctx);
        expect(sentTexts[0]).toContain("ZWUSH STORE — CATALOG & ORDERING");

        await handleIncomingMessage(jid, false, "2", ctx); // Pets
        expect(sentImages.length).toBe(1);
        expect(sentImages[0]?.caption).toContain("CATALOG: 2. 🐾 PETS");

        await handleIncomingMessage(jid, false, "1", ctx); // Dragon Pet
        const hasPrompt = sentImages.some((img) => img.caption.includes("You selected: *Dragon Pet*")) ||
            sentTexts.some((txt) => txt.includes("You selected: *Dragon Pet*"));
        expect(hasPrompt).toBe(true);

        await handleIncomingMessage(jid, false, "AlexBedrock", ctx); // Gamertag
        expect(sentTexts[sentTexts.length - 1]).toContain("ORDER CONFIRMATION");
        expect(sentTexts[sentTexts.length - 1]).toContain("CANNOT BE UNDONE OR REFUNDED");
        expect(sentTexts[sentTexts.length - 1]).toContain("Reply *YES*");

        await handleIncomingMessage(jid, false, "YES", ctx); // Confirm
        const lastImage = sentImages[sentImages.length - 1];
        expect(lastImage?.caption).toContain("ZWUSH STORE PAYMENT INVOICE");
        expect(lastImage?.caption).toContain("AlexBedrock");
    });

    it("should redirect group checkout to user DM when /beli is run in a group", async () => {
        const { ctx, sentTexts, sentTextEvents } = createMockContext();
        const groupJid = "120363000@g.us";
        const participant = "62899912345@s.whatsapp.net";

        await handleIncomingMessage(groupJid, false, "/beli", ctx, participant);

        // Expect message sent to group with mention
        const groupReply = sentTextEvents.find((e) => e.jid === groupJid);
        expect(groupReply).toBeDefined();
        expect(groupReply?.text).toContain("@62899912345");
        expect(groupReply?.text).toContain("chat pribadi");

        // Expect buying flow started in participant's DM
        const dmReply = sentTextEvents.find((e) => e.jid === participant);
        expect(dmReply).toBeDefined();
        expect(dmReply?.text).toContain("ZWUSH STORE — KATALOG & PEMESANAN");
        expect(ctx.state.getSession(participant).step).toBe("AWAITING_CATEGORY");
    });

    it("should answer /faq, /help, /status in group with participant mention", async () => {
        const { ctx, sentTextEvents } = createMockContext();
        const groupJid = "120363000@g.us";
        const participant = "62899912345@s.whatsapp.net";

        await handleIncomingMessage(groupJid, false, "/faq", ctx, participant);
        const faqReply = sentTextEvents.find((e) => e.jid === groupJid);
        expect(faqReply).toBeDefined();
        expect(faqReply?.text).toContain("@62899912345");
        expect(faqReply?.text).toContain("FAQ");

        await handleIncomingMessage(groupJid, false, "/help", ctx, participant);
        const helpReply = sentTextEvents.filter((e) => e.jid === groupJid)[1];
        expect(helpReply).toBeDefined();
        expect(helpReply?.text).toContain("@62899912345");
        expect(helpReply?.text).toContain("BANTUAN");
    });
});
