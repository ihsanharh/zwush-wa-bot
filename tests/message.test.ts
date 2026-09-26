import { describe, expect, it, mock } from "bun:test";
import {
    handleIncomingMessage,
    extractMessageText,
    extractEventTimestampSeconds,
    isEventStale,
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
        const sentImages: Array<{ buffer: Buffer; caption?: string }> = [];

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
            })),
            getBalance: mock(async () => ({
                success: true,
                bot: {
                    gamertag: "hsuwz",
                    tokens: 5,
                    status: "ONLINE"
                },
                summary: {
                    todayOrders: 10,
                    todayCompleted: 7,
                    todayRevenue: 175000,
                    pendingPayment: 2,
                    giftingQueue: 1,
                    insufficientTokens: 0,
                    discountPercent: 10,
                    activeVouchers: 2
                }
            })),
            updateOrderGamertag: mock(async (id: string, gamertag: string) => ({
                success: true,
                orderId: id,
                gamertag,
                status: "QUEUED" as const
            })),
            markOrderAsPaid: mock(async (id: string) => ({
                success: true,
                orderId: id,
                status: "QUEUED",
                gamertag: "Viosca",
                itemName: "Dragon Pet",
                totalNominal: 25012,
                message: `Order #${id} marked as paid and enqueued for gifting`
            }))
        };

        const loggedOrders: Array<Record<string, unknown>> = [];
        const mockAdminLogger = {
            logGroupJid: "120363@g.us",
            adminGroupJid: "120363@g.us",
            groupJid: "120363@g.us",
            getGroupJid: () => mockAdminLogger.logGroupJid,
            setGroupJid: (jid: string) => {
                mockAdminLogger.logGroupJid = jid;
            },
            getLogGroupJid: () => mockAdminLogger.logGroupJid,
            setLogGroupJid: (jid: string) => {
                mockAdminLogger.logGroupJid = jid;
            },
            getAdminGroupJid: () => mockAdminLogger.adminGroupJid,
            setAdminGroupJid: (jid: string) => {
                mockAdminLogger.adminGroupJid = jid;
            },
            logNewOrder: mock(async (order: Record<string, unknown>) => {
                loggedOrders.push(order);
            }),
            updateOrderStatus: mock(async () => {}),
            notifySupportRequest: mock(async (_info: any) => {})
        };

        const sentTextEvents: Array<{ jid: string; text: string; mentions?: string[] }> = [];

        const ctx: BotContext = {
            client: mockClient as unknown as CoreClient,
            adminLogger: mockAdminLogger as any,
            state: new StateManager(),
            sendText: mock(async (jid: string, text: string, mentions?: string[]) => {
                sentTexts.push(text);
                sentTextEvents.push({ jid, text, mentions });
            }),
            sendImage: mock(async (_jid: string, buffer: Buffer, caption?: string) => {
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

    it("should respond to /menu with category menu without informing about /menu redirect", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "/menu", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).not.toContain("digabung ke */beli*");
        expect(sentTexts[0]).toContain("ZWUSH STORE — KATALOG & PEMESANAN");
        expect(sentTexts[0]).toContain("*1.* 👑 Main Store & Ranks");
        expect(sentTexts[0]).toContain("*2.* 🐾 Pets");
        expect(sentTexts[0]).toContain("Ketik nomor kategori (*1 - 6*)");
    });

    it("should respond to /katalog by sending category posters without individual captions and a single CTA text message", async () => {
        const { ctx, sentTexts, sentImages } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "/katalog", ctx);

        // Expect posters or fallback texts to be sent for categories
        const hasPosters = sentImages.length > 0 || sentTexts.length > 1;
        expect(hasPosters).toBe(true);

        // Posters should NOT have individual captions (allowing WA to group them as an album)
        for (const img of sentImages) {
            expect(img.caption || "").toBe("");
        }

        // Exactly one text message should be sent with the catalog summary and CTA
        expect(sentTexts.length).toBe(1);
        const lastText = sentTexts[sentTexts.length - 1];
        expect(lastText).toContain("KATALOG LENGKAP");
        expect(lastText).toContain("/beli");
    });

    it("should respond to /katalog <category> with specific category poster and CTA", async () => {
        const { ctx, sentTexts, sentImages } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "/katalog 2", ctx);

        const hasContent = sentImages.length > 0 || sentTexts.length > 0;
        expect(hasContent).toBe(true);
        if (sentImages.length > 0) {
            expect(sentImages[0].caption).toContain("PETS");
            expect(sentImages[0].caption).toContain("/beli");
        } else {
            expect(sentTexts[0]).toContain("/beli");
        }
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

    it("should respond to natural greetings when idle with /katalog prompt", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("user@s.whatsapp.net", false, "halo", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("Selamat datang di *Zwush Store*");
        expect(sentTexts[0]).toContain("*/katalog*");
        expect(sentTexts[0]).not.toContain("*/beli*");
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

    it("should allow any participant in admin group to reprocess all failing orders with /reprocess", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.adminGroupJid = "admin-group@g.us";
        await handleIncomingMessage("admin-group@g.us", false, "/reprocess", ctx, "any_member@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("REPROCESS SELESAI");
        expect(sentTexts[0]).toContain("2 pesanan");
    });

    it("should allow admin to run commands when fromMe is true", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("anyone@s.whatsapp.net", true, "/reprocess", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("REPROCESS SELESAI");
    });

    it("should allow any participant inside admin group to run /admin and /reprocess", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.adminGroupJid = "admin-group@g.us";

        await handleIncomingMessage("admin-group@g.us", false, "/admin", ctx, "any_member@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("PANEL ADMIN");
        expect(sentTexts[0]).toContain("Terverifikasi Admin");

        sentTexts.length = 0;
        await handleIncomingMessage("admin-group@g.us", false, "/reprocess", ctx, "any_member@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("REPROCESS SELESAI");
    });

    it("should allow bot operator (fromMe: true) to run /admin in private chat", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("operator@s.whatsapp.net", true, "/admin", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("PANEL ADMIN");
        expect(sentTexts[0]).toContain("Terverifikasi Admin");
    });

    it("should allow bot operator (fromMe: true) to register group from private chat with /setgroup <jid>", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("operator@s.whatsapp.net", true, "/setgroup 120363000000000000@g.us", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("Berhasil mendaftarkan Admin Group");
        expect(ctx.adminLogger?.getGroupJid()).toBe("120363000000000000@g.us");
    });

    it("should show helpful guide when /setgroup is run by bot operator in private chat without arguments", async () => {
        const { ctx, sentTexts } = createMockContext();
        await handleIncomingMessage("operator@s.whatsapp.net", true, "/setgroup", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("CARA MENDAFTARKAN ADMIN GROUP");
    });

    it("should allow any participant in admin group to reprocess specific order with /reprocess <ID>", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.adminGroupJid = "admin-group@g.us";
        await handleIncomingMessage("admin-group@g.us", false, "/reprocess ord_user_1", ctx, "any_member@s.whatsapp.net");
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
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.adminGroupJid = "admin-group@g.us";
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

        // First /beli starts the session
        await handleIncomingMessage(jid, false, "/beli", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("KATALOG & PEMESANAN");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");

        // Second /beli should warn instead of recreating
        await handleIncomingMessage(jid, false, "/beli", ctx);
        expect(sentTexts.length).toBe(2);
        expect(sentTexts[1]).toContain("Sesi belanja kakak sudah aktif");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");
    });

    it("should only cancel once when spamming Batal", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "canceluser@s.whatsapp.net";

        // Start order flow
        await handleIncomingMessage(jid, false, "/beli", ctx);
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

    it("should display admin only category in /bantuan when called inside admin group", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.adminGroupJid = "admin-group@g.us";
        await handleIncomingMessage("admin-group@g.us", false, "/bantuan", ctx, "any_member@s.whatsapp.net");
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

    it("should allow admin to register groups with /setgroup admin and /setgroup log", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.adminGroupJid = "admin-group@g.us";

        // 1. Register admin group from existing admin group
        await handleIncomingMessage("admin-group@g.us", false, "/setgroup admin", ctx, "any_member@s.whatsapp.net");
        expect(mockAdminLogger.adminGroupJid).toBe("admin-group@g.us");
        expect(sentTexts[0]).toContain("Admin Command Group");

        // 2. Register log group from existing admin group
        sentTexts.length = 0;
        await handleIncomingMessage("admin-group@g.us", false, "/setgroup log", ctx, "any_member@s.whatsapp.net");
        expect(mockAdminLogger.logGroupJid).toBe("admin-group@g.us");
        expect(sentTexts[0]).toContain("Transaction Log Group");

        // 3. /setgroup without subcommand shows guidance
        sentTexts.length = 0;
        await handleIncomingMessage("admin-group@g.us", false, "/setgroup", ctx, "any_member@s.whatsapp.net");
        expect(sentTexts[0]).toContain("PENGATURAN GRUP");
        expect(sentTexts[0]).toContain("/setgroup admin");
        expect(sentTexts[0]).toContain("/setgroup log");
    });

    it("should allow anyone inside registered admin group to run admin commands", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.adminGroupJid = "admin-chat@g.us";

        // Random non-admin participant inside admin group runs /reprocess
        await handleIncomingMessage("admin-chat@g.us", false, "/reprocess", ctx, "random_staff@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("REPROCESS SELESAI");

        // Random staff inside admin group runs /admin
        sentTexts.length = 0;
        await handleIncomingMessage("admin-chat@g.us", false, "/admin", ctx, "random_staff@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("PANEL ADMIN");
        expect(sentTexts[0]).toContain("Terverifikasi Admin");

        // Random staff inside admin group runs /saldo
        sentTexts.length = 0;
        await handleIncomingMessage("admin-chat@g.us", false, "/saldo", ctx, "random_staff@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("SALDO & STATUS BOT");
        expect(sentTexts[0]).toContain("hsuwz");
        expect(sentTexts[0]).toContain("5 Token");
    });

    it("should prevent arbitrary members inside log group from running admin commands", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.logGroupJid = "log-chat@g.us";
        mockAdminLogger.adminGroupJid = "admin-chat@g.us";

        // Non-admin participant inside log group tries to run /reprocess
        await handleIncomingMessage("log-chat@g.us", false, "/reprocess", ctx, "ordinary_user@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("tidak dikenali");

        // Non-admin participant inside log group tries to run /saldo
        sentTexts.length = 0;
        await handleIncomingMessage("log-chat@g.us", false, "/saldo", ctx, "ordinary_user@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("tidak dikenali");
    });

    it("should allow admin to check balance with /saldo (ID) and /balance (EN)", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        mockAdminLogger.adminGroupJid = "admin-group@g.us";

        // Indonesian check
        ctx.state.setLanguage("any_member@s.whatsapp.net", "id");
        await handleIncomingMessage("admin-group@g.us", false, "/saldo", ctx, "any_member@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("SALDO & STATUS BOT");
        expect(sentTexts[0]).toContain("hsuwz");
        expect(sentTexts[0]).toContain("Sisa Token Gift: *5 Token*");
        expect(sentTexts[0]).toContain("Ringkasan Penjualan Hari Ini");

        // English check
        sentTexts.length = 0;
        ctx.state.setLanguage("any_member@s.whatsapp.net", "en");
        await handleIncomingMessage("admin-group@g.us", false, "/balance", ctx, "any_member@s.whatsapp.net");
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("BOT BALANCE & STORE STATUS");
        expect(sentTexts[0]).toContain("Remaining Gift Tokens: *5 Token(s)*");
        expect(sentTexts[0]).toContain("Today's Sales Summary");
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

    it("should inform user politely if typing 'kembali' or 'k' at AWAITING_CATEGORY", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "catbackuser@s.whatsapp.net";

        // Start buying flow (step becomes AWAITING_CATEGORY)
        await handleIncomingMessage(jid, false, "/beli", ctx);
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");
        sentTexts.length = 0;

        // Type 'kembali' at category step
        await handleIncomingMessage(jid, false, "kembali", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("Kakak sudah berada di pilihan kategori");
        expect(sentTexts[0]).not.toContain("Format kategori tidak sesuai");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");
    });

    it("should throttle rapid spamming of 'kembali'", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "spamkembali@s.whatsapp.net";

        // Start buying, select category 2 (step becomes AWAITING_ITEM)
        await handleIncomingMessage(jid, false, "/beli 2", ctx);
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_ITEM");
        sentTexts.length = 0;

        // First kembali goes back to category
        await handleIncomingMessage(jid, false, "k", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("Kembali ke pilihan kategori");

        // Immediate second kembali should be throttled (<1500ms)
        await handleIncomingMessage(jid, false, "k", ctx);
        expect(sentTexts.length).toBe(1); // unchanged
    });

    it("should remain silent when user triggers 'kembali' or 'batal' while IDLE", async () => {
        const { ctx, sentTexts } = createMockContext();
        const jid = "idleuser@s.whatsapp.net";

        expect(ctx.state.getSession(jid).step).toBe("IDLE");

        // Type kembali while IDLE - should not reply
        await handleIncomingMessage(jid, false, "kembali", ctx);
        expect(sentTexts.length).toBe(0);

        // Type batal while IDLE - should not reply
        await handleIncomingMessage(jid, false, "batal", ctx);
        expect(sentTexts.length).toBe(0);

        // Type /kembali or /batal while IDLE - should not reply
        await handleIncomingMessage(jid, false, "/kembali", ctx);
        await handleIncomingMessage(jid, false, "/batal", ctx);
        expect(sentTexts.length).toBe(0);
    });

    it("should remain silent in group chat for /batal and /kembali when participant is IDLE", async () => {
        const { ctx, sentTextEvents } = createMockContext();
        const groupJid = "120363000@g.us";
        const participant = "62899912345@s.whatsapp.net";

        // Group /batal when idle - should not reply
        await handleIncomingMessage(groupJid, false, "/batal", ctx, participant);
        expect(sentTextEvents.length).toBe(0);

        // Group /kembali when idle - should not reply
        await handleIncomingMessage(groupJid, false, "/kembali", ctx, participant);
        expect(sentTextEvents.length).toBe(0);
    });

    it("should handle gamertag retry flow when order failed on Hive (re-ask and confirmation)", async () => {
        const { ctx, sentTexts, mockClient } = createMockContext();
        const jid = "retry_buyer@s.whatsapp.net";

        // Setup session in AWAITING_RETRY_GAMERTAG
        ctx.state.setRetryOrder(jid, {
            orderId: "ord_retry_flow",
            itemName: "Dragon Pet",
            oldGamertag: "WrongTag",
            attempts: 1
        });

        // 1. Buyer enters new gamertag
        await handleIncomingMessage(jid, false, "RealSteve", ctx);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("KONFIRMASI GAMERTAG BARU");
        expect(sentTexts[0]).toContain("RealSteve");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_RETRY_CONFIRMATION");

        // 2. Buyer confirms with YA
        await handleIncomingMessage(jid, false, "YA", ctx);
        expect(sentTexts.length).toBe(2);
        expect(sentTexts[1]).toContain("BERHASIL DIPERBARUI");
        expect(sentTexts[1]).toContain("RealSteve");
        expect(mockClient.updateOrderGamertag).toHaveBeenCalledWith("ord_retry_flow", "RealSteve");
        expect(ctx.state.getSession(jid).step).toBe("IDLE");
    });

    it("should ask user consent on /support before starting live chat, silence bot replies, and restore via /solved", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        const jid = "need_support@s.whatsapp.net";

        ctx.state.setLastFailedOrder(jid, {
            orderId: "ord_failed_3x",
            itemName: "Dragon Pet",
            gamertag: "WrongTag99",
            attempts: 3
        });

        // 1. Buyer sends /support -> asks for consent first (not automatically live yet!)
        await handleIncomingMessage(jid, false, "/support", ctx);

        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]).toContain("BANTUAN LIVE CHAT ADMIN");
        expect(sentTexts[0]).toContain("Apakah kakak ingin memulai sesi *Live Chat*");
        expect(sentTexts[0]).toContain("Balas *YA*");
        expect(sentTexts[0]).toContain("Balas *BATAL*");
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_SUPPORT_CONFIRMATION");

        // Admin group is NOT alerted yet before consent!
        expect(mockAdminLogger.notifySupportRequest).not.toHaveBeenCalled();

        // 2. Buyer confirms with YA -> now live chat is activated!
        await handleIncomingMessage(jid, false, "YA", ctx);

        expect(sentTexts.length).toBe(2);
        expect(sentTexts[1]).toContain("MODE LIVE CHAT AKTIF");
        expect(sentTexts[1]).toContain("Balasan otomatis bot dinonaktifkan sementara");
        expect(ctx.state.getSession(jid).step).toBe("LIVE_CHAT");

        // Admin group now gets alerted
        expect(mockAdminLogger.notifySupportRequest).toHaveBeenCalled();
        const calledArg = (mockAdminLogger.notifySupportRequest as any).mock.calls[0][0];
        expect(calledArg.orderId).toBe("ord_failed_3x");
        expect(calledArg.attempts).toBe(3);

        // 3. Buyer sends regular messages or commands during live chat mode -> bot is silenced!
        await handleIncomingMessage(jid, false, "halo min, mau nanya kok failed ya?", ctx);
        await handleIncomingMessage(jid, false, "/katalog", ctx);
        // Still only 2 messages sent to buyer (no automated replies)
        expect(sentTexts.length).toBe(2);

        // 4. Admin sends /solved in admin group
        const adminGroupJid = "120363@g.us";
        await handleIncomingMessage(adminGroupJid, false, "/solved ord_failed_3x", ctx, "admin@s.whatsapp.net");

        // Admin group gets confirmation, and buyer gets closing message
        expect(sentTexts.length).toBe(4);
        const buyerClosingMsg = sentTexts[2];
        expect(buyerClosingMsg).toContain("SESI BANTUAN SELESAI");
        expect(buyerClosingMsg).toContain("*/katalog*");

        const adminConfirmMsg = sentTexts[3];
        expect(adminConfirmMsg).toContain("TIKET LIVE CHAT BERHASIL DISELESAIKAN");
        expect(adminConfirmMsg).toContain("#ord_failed_3x");

        // Session is back to IDLE
        expect(ctx.state.getSession(jid).step).toBe("IDLE");

        // 5. Buyer sends greeting now -> bot is back online!
        await handleIncomingMessage(jid, false, "halo", ctx);
        expect(sentTexts.length).toBe(5);
        expect(sentTexts[4]).toContain("Selamat datang di *Zwush Store*");
        expect(sentTexts[4]).toContain("*/katalog*");
    });

    it("should allow user to cancel live chat consent on /support", async () => {
        const { ctx, sentTexts, mockAdminLogger } = createMockContext();
        const jid = "cancel_support@s.whatsapp.net";

        await handleIncomingMessage(jid, false, "/support", ctx);
        expect(ctx.state.getSession(jid).step).toBe("AWAITING_SUPPORT_CONFIRMATION");

        await handleIncomingMessage(jid, false, "BATAL", ctx);
        expect(sentTexts.length).toBe(2);
        expect(sentTexts[1]).toContain("Sesi live chat dibatalkan");
        expect(sentTexts[1]).toContain("*/katalog*");
        expect(ctx.state.getSession(jid).step).toBe("IDLE");
        expect(mockAdminLogger.notifySupportRequest).not.toHaveBeenCalled();
    });

    describe("Stale Message Guarding & Timestamps", () => {
        it("should correctly extract timestamp in seconds from various event formats", () => {
            // zapo-js timestampSeconds
            expect(extractEventTimestampSeconds({ timestampSeconds: 1727360000 })).toBe(1727360000);

            // rawNode.attrs.t
            expect(extractEventTimestampSeconds({ rawNode: { attrs: { t: "1727360000" } } })).toBe(1727360000);

            // protobuf Long object
            expect(extractEventTimestampSeconds({ messageTimestamp: { low: 1727360000, high: 0 } })).toBe(1727360000);

            // protobuf message nested
            expect(extractEventTimestampSeconds({ message: { messageTimestamp: 1727360000 } })).toBe(1727360000);

            // raw message nested
            expect(extractEventTimestampSeconds({ raw: { messageTimestamp: 1727360000 } })).toBe(1727360000);

            // millisecond timestamp (> 1e11)
            expect(extractEventTimestampSeconds({ timestamp: 1727360000000 })).toBe(1727360000);

            // invalid or null
            expect(extractEventTimestampSeconds(null)).toBeNull();
            expect(extractEventTimestampSeconds({})).toBeNull();
            expect(extractEventTimestampSeconds({ timestamp: -1 })).toBeNull();
        });

        it("should detect whether an event is fresh or stale (> 300s limit)", () => {
            const nowSec = Math.floor(Date.now() / 1000);

            // Fresh message (10 seconds ago)
            const freshEvent = { timestampSeconds: nowSec - 10 };
            const freshRes = isEventStale(freshEvent, 300);
            expect(freshRes.stale).toBe(false);

            // Boundary message (299 seconds ago)
            const boundaryEvent = { timestampSeconds: nowSec - 299 };
            expect(isEventStale(boundaryEvent, 300).stale).toBe(false);

            // Stale message (301 seconds ago)
            const staleEvent = { timestampSeconds: nowSec - 301 };
            const staleRes = isEventStale(staleEvent, 300);
            expect(staleRes.stale).toBe(true);
            expect(staleRes.ageSec).toBeGreaterThanOrEqual(301);

            // Offline catch-up stanza with missing timestamp -> considered stale
            const offlineCatchupEvent = { offline: true };
            expect(isEventStale(offlineCatchupEvent, 300).stale).toBe(true);

            // Normal live message with missing timestamp -> not flagged as stale unless offline
            expect(isEventStale({}, 300).stale).toBe(false);
        });

        it("should drop incoming message if timestampSeconds is older than 5 minutes (300s)", async () => {
            const { ctx, sentTexts } = createMockContext();
            const jid = "buyer_stale@s.whatsapp.net";
            const nowSec = Math.floor(Date.now() / 1000);

            // Send stale message from 10 minutes ago (600s)
            const staleTs = nowSec - 600;
            await handleIncomingMessage(jid, false, "/beli", ctx, undefined, staleTs);

            // No replies should have been sent to the buyer
            expect(sentTexts.length).toBe(0);
            expect(ctx.state.getSession(jid).step).toBe("IDLE");

            // Fresh message from 30 seconds ago should be processed normally
            const freshTs = nowSec - 30;
            await handleIncomingMessage(jid, false, "/beli", ctx, undefined, freshTs);

            expect(sentTexts.length).toBeGreaterThan(0);
            expect(ctx.state.getSession(jid).step).toBe("AWAITING_CATEGORY");
        });
    });

    describe("Admin Manual Payment Verification (/paid, /acc)", () => {
        it("should show help when /paid is called without arguments", async () => {
            const { ctx, sentTexts } = createMockContext();
            const adminGroup = "120363@g.us";

            await handleIncomingMessage(adminGroup, false, "/paid", ctx, "admin@s.whatsapp.net");
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0]).toContain("FORMAT PERINTAH BYPASS PEMBAYARAN");
            expect(sentTexts[0]).toContain("*/paid <order_id>*");
        });

        it("should successfully mark order as paid via /paid in admin group", async () => {
            const { ctx, sentTexts, mockClient } = createMockContext();
            const adminGroup = "120363@g.us";

            await handleIncomingMessage(adminGroup, false, "/paid ORD-I82AME", ctx, "admin@s.whatsapp.net");
            expect(mockClient.markOrderAsPaid).toHaveBeenCalledWith("ORD-I82AME");
            expect(sentTexts.length).toBe(1);
            expect(sentTexts[0]).toContain("PEMBAYARAN DIVERIFIKASI MANUAL");
            expect(sentTexts[0]).toContain("#ORD-I82AME");
            expect(sentTexts[0]).toContain("QUEUED");
        });

        it("should normalize order ID (auto prefix ORD- and strip #)", async () => {
            const { ctx, mockClient } = createMockContext();
            const adminGroup = "120363@g.us";

            await handleIncomingMessage(adminGroup, false, "/acc #I82AME", ctx, "admin@s.whatsapp.net");
            expect(mockClient.markOrderAsPaid).toHaveBeenCalledWith("ORD-I82AME");
        });

        it("should reject non-admin from using /paid", async () => {
            const { ctx, sentTexts, mockClient } = createMockContext();
            const userJid = "normal_user@s.whatsapp.net";

            await handleIncomingMessage(userJid, false, "/paid ORD-I82AME", ctx);
            expect(mockClient.markOrderAsPaid).not.toHaveBeenCalled();
            expect(sentTexts[0]).toContain("Perintah tidak dikenali");
        });
    });
});
