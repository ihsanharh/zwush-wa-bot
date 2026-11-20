import { describe, it, expect, beforeEach, mock } from "bun:test";
import { handleIncomingMessage, type BotContext } from "../../src/handlers/message";
import { AdminGroupLogger } from "../../src/handlers/adminLogger";
import { StateManager } from "../../src/state";
import type { CatalogItem, FeaturedBundleConfig } from "../../src/types";

describe("Admin Featured Bundle Management & Setup Wizard", () => {
    let state: StateManager;
    let sentTexts: { jid: string; text: string; mentions?: string[] }[];
    let sentButtons: { jid: string; payload: any }[];
    let savedPayloads: any[];
    let toggledStates: boolean[];
    let currentFeatured: FeaturedBundleConfig;
    let mockContext: BotContext;

    const adminGroupJid = "12036304@g.us";
    const adminUser = "628999999999@s.whatsapp.net";
    const buyerUser = "628111111111@s.whatsapp.net";
    const botJid = "628222222222@s.whatsapp.net";

    const sampleCatalog: CatalogItem[] = [
        {
            id: "bf-1",
            name: "Black Friday Bundle",
            category: "Bundles",
            tokenCost: 6,
            minecoins: 1000,
            originalPrice: 80000,
            rupiahPrice: 60000,
            discountPercent: 25,
            active: true
        },
        {
            id: "ult-1",
            name: "Ultimate Rank",
            category: "Ranks",
            tokenCost: 22,
            minecoins: 3420,
            originalPrice: 440000,
            rupiahPrice: 330000,
            discountPercent: 25,
            active: true
        },
        {
            id: "ult-2",
            name: "Ultimate Rank Upgrade",
            category: "Ranks",
            tokenCost: 11,
            minecoins: 1690,
            originalPrice: 220000,
            rupiahPrice: 165000,
            discountPercent: 25,
            active: true
        }
    ];

    const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    beforeEach(() => {
        state = new StateManager();
        state.setMaintenanceMode(false);
        sentTexts = [];
        sentButtons = [];
        savedPayloads = [];
        toggledStates = [];

        currentFeatured = {
            configured: false,
            enabled: false,
            available: false,
            unavailableReason: null,
            itemName: null,
            customMessage: null,
            hasImage: false,
            imageMimetype: null,
            updatedAt: null,
            item: null
        };

        const adminLogger = new AdminGroupLogger(
            { adminGroupJid, logGroupJid: "12036305@g.us" },
            {
                sendMessage: async () => ({ id: "msg-1" }),
                editMessage: async () => ({})
            }
        );
        adminLogger.addAdminUser(adminUser);

        mockContext = {
            state,
            adminLogger,
            botJid,
            client: {
                getCatalog: mock(async () => sampleCatalog),
                getFeaturedBundle: mock(async () => currentFeatured),
                getFeaturedBundleImage: mock(async () => ({ buffer: jpegBuf, mimetype: "image/jpeg" })),
                saveFeaturedBundle: mock(async (payload: any) => {
                    savedPayloads.push(payload);
                    const matchedItem = sampleCatalog.find((i) => i.name === payload.itemName) || sampleCatalog[0]!;
                    currentFeatured = {
                        configured: true,
                        enabled: payload.enabled,
                        available: true,
                        unavailableReason: null,
                        itemName: payload.itemName,
                        customMessage: payload.customMessage,
                        hasImage: true,
                        imageMimetype: payload.imageMimetype || currentFeatured.imageMimetype || "image/jpeg",
                        updatedAt: "2026-11-20T16:00:00.000Z",
                        item: matchedItem
                    };
                    return currentFeatured;
                }),
                toggleFeaturedBundle: mock(async (enabled: boolean) => {
                    toggledStates.push(enabled);
                    currentFeatured = { ...currentFeatured, enabled };
                    return currentFeatured;
                })
            } as any,
            sendText: async (jid: string, text: string, mentions?: string[]) => {
                sentTexts.push({ jid, text, mentions });
            },
            sendButtons: async (jid: string, payload: any) => {
                sentButtons.push({ jid, payload });
                return { key: { id: `msg-${sentButtons.length}` } };
            },
            sendImage: async () => ({})
        };
    });

    it("shows unconfigured overview then configured overview (including unavailable warning)", async () => {
        await handleIncomingMessage(adminGroupJid, false, "admin_panel_featured", mockContext, adminUser);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]!.payload.text).toContain("Belum Diatur");
        expect(sentButtons[0]!.payload.buttons.map((b: any) => b.id)).toEqual([
            "btn_admin_featured_setup",
            "btn_admin_panel"
        ]);

        sentButtons = [];
        currentFeatured = {
            configured: true,
            enabled: true,
            available: false,
            unavailableReason: "ITEM_INACTIVE",
            itemName: "Old Seasonal Bundle",
            customMessage: "Promo terbatas!",
            hasImage: true,
            imageMimetype: "image/png",
            updatedAt: "2026-11-20T12:00:00.000Z",
            item: { ...sampleCatalog[0]!, name: "Old Seasonal Bundle", active: false }
        };

        await handleIncomingMessage(adminGroupJid, false, "admin_panel_featured", mockContext, adminUser);
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]!.payload.text).toContain("Aktif (ON)");
        expect(sentButtons[0]!.payload.text).toContain("tidak aktif di katalog");
        expect(sentButtons[0]!.payload.buttons.map((b: any) => b.id)).toEqual([
            "btn_admin_featured_toggle_off",
            "btn_admin_featured_setup",
            "btn_admin_featured_preview"
        ]);
    });

    it("completes setup wizard via photo+caption shortcut, item keyword, live preview, and Save & Enable", async () => {
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_setup", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_IMAGE");

        // Send image WITH caption -> skips Step 2 directly to Step 3!
        sentButtons = [];
        await handleIncomingMessage(
            adminGroupJid,
            false,
            "🔥 Black Friday Promo!",
            mockContext,
            adminUser,
            undefined,
            undefined,
            [],
            {
                mimetype: "image/jpeg",
                caption: "🔥 Black Friday Promo!",
                download: async () => jpegBuf
            }
        );
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_ITEM");
        expect(sentButtons[0]!.payload.text).toContain("PILIH ITEM KATALOG");

        // Type partial keyword matching 1 item -> jumps straight to Step 4 Preview & Confirm
        sentButtons = [];
        await handleIncomingMessage(adminGroupJid, false, "Black Friday", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_CONFIRM");
        expect(sentButtons.length).toBe(2);
        // Message 1 is preview card with image header and noop button
        expect(sentButtons[0]!.payload.headerImage).toEqual(jpegBuf);
        expect(sentButtons[0]!.payload.headerImageMimetype).toBe("image/jpeg");
        expect(sentButtons[0]!.payload.text).toContain("🔥 Black Friday Promo!");
        expect(sentButtons[0]!.payload.text).toContain("Black Friday Bundle");
        expect(sentButtons[0]!.payload.buttons[0].id).toBe("btn_admin_featured_noop");
        // Message 2 is confirm controls (max 3 buttons)
        expect(sentButtons[1]!.payload.buttons.map((b: any) => b.id)).toEqual([
            "btn_admin_featured_save_on",
            "btn_admin_featured_save_off",
            "btn_admin_featured_cancel"
        ]);

        // Save & Enable
        sentButtons = [];
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_save_on", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBeUndefined();
        expect(savedPayloads.length).toBe(1);
        expect(savedPayloads[0]).toEqual({
            itemName: "Black Friday Bundle",
            customMessage: "🔥 Black Friday Promo!",
            enabled: true,
            imageBase64: jpegBuf.toString("base64"),
            imageMimetype: "image/jpeg"
        });
        expect(sentButtons[0]!.payload.text).toContain("DISIMPAN & DIAKTIFKAN");
    });

    it("handles photo without caption -> Step 2 message -> multi-match picker -> Save (OFF)", async () => {
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_setup", mockContext, adminUser);

        // Text instead of image is rejected gently
        sentButtons = [];
        await handleIncomingMessage(adminGroupJid, false, "just text", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_IMAGE");
        expect(sentButtons[0]!.payload.text).toContain("file gambar promo");

        // Captionless PNG image -> Step 2
        sentButtons = [];
        await handleIncomingMessage(
            adminGroupJid,
            false,
            "",
            mockContext,
            adminUser,
            undefined,
            undefined,
            [],
            {
                mimetype: "image/png",
                caption: "",
                download: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47])
            }
        );
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_MESSAGE");

        // Step 2 custom message -> Step 3
        await handleIncomingMessage(adminGroupJid, false, "Rank promo mingguan!", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_ITEM");

        // Query "Ult" matches 2 items ("Ultimate Rank" and "Ultimate Rank Upgrade")
        sentButtons = [];
        await handleIncomingMessage(adminGroupJid, false, "Ult", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_ITEM");
        expect(sentButtons[0]!.payload.buttons.map((b: any) => b.id)).toEqual([
            "btn_admin_featured_pick_0",
            "btn_admin_featured_pick_1",
            "btn_admin_featured_cancel"
        ]);

        // Pick second match (Ultimate Rank Upgrade)
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_pick_1", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_CONFIRM");

        // Save (OFF)
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_save_off", mockContext, adminUser);
        expect(savedPayloads.length).toBe(1);
        expect(savedPayloads[0].enabled).toBe(false);
        expect(savedPayloads[0].itemName).toBe("Ultimate Rank Upgrade");
    });

    it("supports editing while keeping existing image, and keeps existing image omitted in PUT payload", async () => {
        currentFeatured = {
            configured: true,
            enabled: true,
            available: true,
            unavailableReason: null,
            itemName: "Black Friday Bundle",
            customMessage: "Old message",
            hasImage: true,
            imageMimetype: "image/jpeg",
            updatedAt: "2026-11-20T12:00:00.000Z",
            item: sampleCatalog[0]!
        };

        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_setup", mockContext, adminUser);
        expect(sentButtons[0]!.payload.buttons.some((b: any) => b.id === "btn_admin_featured_keep_image")).toBe(true);

        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_keep_image", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_MESSAGE");

        await handleIncomingMessage(adminGroupJid, false, "New Promo Text!", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_ITEM");

        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_keep_item", mockContext, adminUser);
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_CONFIRM");

        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_save_on", mockContext, adminUser);
        expect(savedPayloads.length).toBe(1);
        expect(savedPayloads[0].imageBase64).toBeUndefined();
        expect(savedPayloads[0].customMessage).toBe("New Promo Text!");
        expect(savedPayloads[0].itemName).toBe("Black Friday Bundle");
    });

    it("rejects invalid image mimetype and oversized buffers", async () => {
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_setup", mockContext, adminUser);

        sentButtons = [];
        await handleIncomingMessage(
            adminGroupJid,
            false,
            "",
            mockContext,
            adminUser,
            undefined,
            undefined,
            [],
            {
                mimetype: "image/gif",
                caption: "",
                download: async () => Buffer.from("GIF89a")
            }
        );
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_IMAGE");
        expect(sentButtons[0]!.payload.text).toContain("tidak didukung");

        sentButtons = [];
        await handleIncomingMessage(
            adminGroupJid,
            false,
            "",
            mockContext,
            adminUser,
            undefined,
            undefined,
            [],
            {
                mimetype: "image/png",
                caption: "",
                download: async () => Buffer.alloc(5 * 1024 * 1024 + 5)
            }
        );
        expect(state.getAdminFeaturedStep(adminUser)).toBe("ADMIN_AWAITING_FEATURED_IMAGE");
        expect(sentButtons[0]!.payload.text).toContain("terlalu besar");
    });

    it("supports toggle, preview, noop click, and silently drops captionless images outside wizard", async () => {
        currentFeatured = {
            configured: true,
            enabled: true,
            available: true,
            unavailableReason: null,
            itemName: "Black Friday Bundle",
            customMessage: "Promo aktif!",
            hasImage: true,
            imageMimetype: "image/jpeg",
            updatedAt: "2026-11-20T12:00:00.000Z",
            item: sampleCatalog[0]!
        };

        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_toggle_off", mockContext, adminUser);
        expect(toggledStates).toEqual([false]);
        expect(sentButtons[0]!.payload.text).toContain("DINONAKTIFKAN");

        sentButtons = [];
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_preview", mockContext, adminUser);
        expect(sentButtons.length).toBe(2);
        expect(sentButtons[0]!.payload.buttons[0].id).toBe("btn_admin_featured_noop");

        sentButtons = [];
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_featured_noop", mockContext, adminUser);
        expect(sentButtons.length).toBe(0);

        // Non-admin buyer sending captionless photo does NOT trigger greeting
        sentButtons = [];
        sentTexts = [];
        await handleIncomingMessage(
            buyerUser,
            false,
            "",
            mockContext,
            undefined,
            undefined,
            undefined,
            [],
            {
                mimetype: "image/jpeg",
                caption: "",
                download: async () => jpegBuf
            }
        );
        expect(sentButtons.length).toBe(0);
        expect(sentTexts.length).toBe(0);
    });
});
