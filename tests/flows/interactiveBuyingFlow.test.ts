import { describe, it, expect, beforeEach } from "bun:test";
import { handleBuyingFlow } from "../../src/flows/buyingFlow";
import { handleIncomingMessage } from "../../src/handlers/message";
import { StateManager } from "../../src/state";
import type { BotContext } from "../../src/handlers/message";
import type { CatalogItem } from "../../src/types";

describe("Interactive Buying Flow & Zero-Text Policy", () => {
    let state: StateManager;
    let sentTexts: { jid: string; text: string }[];
    let sentLists: { jid: string; payload: any }[];
    let sentButtons: { jid: string; payload: any }[];
    let sentImages: { jid: string; caption?: string }[];
    let mockContext: BotContext;
    const testJid = "628123456789@s.whatsapp.net";

    const catalogItems: CatalogItem[] = [
        {
            id: "pet-1",
            name: "Dragon Pet",
            category: "Regular Pet",
            tokenCost: 10,
            minecoins: 0,
            rupiahPrice: 25000,
            originalPrice: 50000,
            discountPercent: 50,
            active: true
        },
        {
            id: "pet-2",
            name: "Wolf Pet",
            category: "Regular Pet",
            tokenCost: 5,
            minecoins: 0,
            rupiahPrice: 15000,
            originalPrice: 30000,
            discountPercent: 50,
            active: true
        }
    ];

    beforeEach(() => {
        state = new StateManager();
        state.setMaintenanceMode(false);
        sentTexts = [];
        sentLists = [];
        sentButtons = [];
        sentImages = [];

        mockContext = {
            state,
            client: {
                getCatalog: async () => catalogItems,
                createOrder: async (gamertag: string, itemName: string, _jid: string, voucher?: string) => ({
                    orderId: "ORD-TEST99",
                    gamertag,
                    itemName,
                    totalNominal: voucher ? 20000 : 25000,
                    status: "PENDING_PAYMENT",
                    qrisString: "00020101021226..."
                }),
                getOrderQrPng: async () => Buffer.from("fake-png"),
                validateVoucher: async (code: string, _item: string) => {
                    if (code === "HEMAT5K") {
                        return {
                            code: "HEMAT5K",
                            discountNominal: 5000,
                            finalPrice: 20000
                        };
                    }
                    throw new Error("INVALID_VOUCHER");
                }
            } as any,
            sendText: async (jid: string, text: string) => {
                sentTexts.push({ jid, text });
            },
            sendImage: async (jid: string, _buf: Buffer, caption?: string) => {
                sentImages.push({ jid, caption });
                return { key: { id: "msg-img-1" } };
            },
            sendList: async (jid: string, payload: any) => {
                sentLists.push({ jid, payload });
                return { key: { id: `msg-list-${sentLists.length}` } };
            },
            sendButtons: async (jid: string, payload: any) => {
                sentButtons.push({ jid, payload });
                return { key: { id: `msg-btn-${sentButtons.length}` } };
            }
        };
    });

    it("should handle category selection (cat_pets) statelessly, send poster and item list menu", async () => {
        expect(state.getSession(testJid).step).toBe("IDLE");

        const handled = await handleBuyingFlow(testJid, false, "cat_Pets", mockContext, "id");
        expect(handled).toBe(true);
        expect(state.getSession(testJid).step).toBe("IDLE");
        expect(state.getSession(testJid).selectedCategory).toBe("Regular Pet");

        // Per requirement: must still send poster, then paginated list below it
        expect(sentImages.length).toBeGreaterThanOrEqual(1);
        expect(sentLists.length).toBe(1);
        expect(sentLists[0]!.payload.listMessage.title).toContain("Katalog");
    });

    it("should silently drop free-form text in AWAITING_CATEGORY (Zero-Text policy)", async () => {
        state.startBuyingFlow(testJid);
        const handled = await handleBuyingFlow(testJid, false, "halo mau beli nih", mockContext, "id");
        expect(handled).toBe(true);
        // Did not send any error message
        expect(sentTexts.length).toBe(0);
        expect(state.getSession(testJid).step).toBe("AWAITING_CATEGORY");
    });

    it("should select item (item_pet-1) and prompt for gamertag with action buttons", async () => {
        state.startBuyingFlow(testJid);
        state.setCategory(testJid, "Regular Pet");

        const handled = await handleBuyingFlow(testJid, false, "item_pet-1", mockContext, "id");
        expect(handled).toBe(true);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        expect(state.getSession(testJid).selectedItem?.name).toBe("Dragon Pet");

        // Verified: Pesan 1 (gambar + pilihan mantap + buttons) & Pesan 2 (tanya input gamertag)
        expect(sentButtons.length).toBe(1);
        expect(sentImages.length).toBe(0);
        expect(sentButtons[0]!.payload.text).toContain("Pilihan mantap kak");
        const btns = sentButtons[0]!.payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(btns.length).toBe(2);
        const b0 = JSON.parse(btns[0].buttonParamsJson);
        const b1 = JSON.parse(btns[1].buttonParamsJson);
        expect(b0.id).toBe("btn_modify_change_item");
        expect(b1.id).toBe("btn_cancel_order");

        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]!.text).toContain("Gamertag Minecraft Bedrock");
    });

    it("should go back to item selection on btn_modify_change_item during AWAITING_GAMERTAG", async () => {
        state.setCategory(testJid, "Regular Pet");
        state.setItem(testJid, catalogItems[0]!);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");

        sentLists = [];
        const handled = await handleBuyingFlow(testJid, false, "btn_modify_change_item", mockContext, "id");
        expect(handled).toBe(true);
        expect(state.getSession(testJid).step).toBe("IDLE");
        expect(sentLists.length).toBe(1);
    });

    it("should silently drop stale buttons during AWAITING_GAMERTAG", async () => {
        state.setCategory(testJid, "Regular Pet");
        state.setItem(testJid, catalogItems[0]!);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");

        sentTexts = [];
        sentButtons = [];

        // Clicking older item or category or start buying button should NOT be treated as gamertag
        await handleIncomingMessage(testJid, false, "item_pet-2", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        expect(sentTexts.length).toBe(0);

        await handleIncomingMessage(testJid, false, "cat_Pets", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        expect(sentTexts.length).toBe(0);

        await handleIncomingMessage(testJid, false, "btn_start_buying", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        expect(sentTexts.length).toBe(0);
    });

    it("should accept valid gamertag and send 3-button confirmation", async () => {
        state.startBuyingFlow(testJid);
        state.setCategory(testJid, "Regular Pet");
        state.setItem(testJid, catalogItems[0]!);

        const handled = await handleBuyingFlow(testJid, false, "SteveGamer", mockContext, "id");
        expect(handled).toBe(true);
        expect(state.getSession(testJid).step).toBe("AWAITING_CONFIRMATION");
        expect(state.getSession(testJid).gamertag).toBe("SteveGamer");

        expect(sentButtons.length).toBe(1);
        const btns = sentButtons[0]!.payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(btns.length).toBe(3);
        const b0 = JSON.parse(btns[0].buttonParamsJson);
        const b1 = JSON.parse(btns[1].buttonParamsJson);
        const b2 = JSON.parse(btns[2].buttonParamsJson);
        expect(b0.id).toBe("btn_confirm_order");
        expect(b1.id).toBe("btn_open_voucher");
        expect(b2.id).toBe("btn_modify_menu");
    });

    it("should handle voucher entry flow and auto-revalidate voucher on item change", async () => {
        state.startBuyingFlow(testJid);
        state.setCategory(testJid, "Regular Pet");
        state.setItem(testJid, catalogItems[0]!);
        state.setGamertag(testJid, "SteveGamer");

        // 1. Click 'Pakai Voucher' button
        await handleBuyingFlow(testJid, false, "btn_open_voucher", mockContext, "id");
        expect(state.getSession(testJid).step).toBe("AWAITING_VOUCHER_CODE");

        // 2. Type voucher code
        await handleBuyingFlow(testJid, false, "HEMAT5K", mockContext, "id");
        expect(state.getSession(testJid).step).toBe("AWAITING_CONFIRMATION");
        expect(state.getSession(testJid).appliedVoucher?.code).toBe("HEMAT5K");
        expect(state.getSession(testJid).appliedVoucher?.discountNominal).toBe(5000);

        // Buttons now have 'Hapus Voucher' as button 2
        const lastBtns = sentButtons[sentButtons.length - 1]!.payload.interactiveMessage.nativeFlowMessage.buttons;
        const lastB1 = JSON.parse(lastBtns[1].buttonParamsJson);
        expect(lastB1.id).toBe("btn_remove_voucher");

        // 3. User modifies item (back to item selection and chooses pet-2)
        await handleBuyingFlow(testJid, false, "btn_modify_change_item", mockContext, "id");
        expect(state.getSession(testJid).step).toBe("IDLE");

        // Pick pet-2: since gamertag was already entered, it preserves gamertag & voucher and returns to confirmation
        await handleBuyingFlow(testJid, false, "item_pet-2", mockContext, "id");
        expect(state.getSession(testJid).step).toBe("AWAITING_CONFIRMATION");
        expect(state.getSession(testJid).gamertag).toBe("SteveGamer");
        // Voucher should be retained and revalidated
        expect(state.getSession(testJid).appliedVoucher?.code).toBe("HEMAT5K");
    });

    it("should open modify drawer list menu on btn_modify_menu", async () => {
        state.startBuyingFlow(testJid);
        state.setCategory(testJid, "Regular Pet");
        state.setItem(testJid, catalogItems[0]!);
        state.setGamertag(testJid, "SteveGamer");

        await handleBuyingFlow(testJid, false, "btn_modify_menu", mockContext, "id");
        expect(sentLists.length).toBe(1);
        expect(sentLists[0]!.payload.listMessage.title).toContain("Ubah");
    });

    it("should confirm order on btn_confirm_order, generate QR and send invoice buttons", async () => {
        state.startBuyingFlow(testJid);
        state.setCategory(testJid, "Regular Pet");
        state.setItem(testJid, catalogItems[0]!);
        state.setGamertag(testJid, "SteveGamer");

        const handled = await handleBuyingFlow(testJid, false, "btn_confirm_order", mockContext, "id");
        expect(handled).toBe(true);
        expect(state.getSession(testJid).step).toBe("IDLE");
        expect(state.getActiveOrderId(testJid)).toBe("ORD-TEST99");

        // QR image sent
        expect(sentImages.length).toBe(1);
        expect(sentImages[0]!.caption).toContain("ORD-TEST99");

        // Invoice action buttons sent
        expect(sentButtons.length).toBe(1);
        const invoiceBtns = sentButtons[0]!.payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(invoiceBtns.length).toBe(2);
        const ib0 = JSON.parse(invoiceBtns[0].buttonParamsJson);
        const ib1 = JSON.parse(invoiceBtns[1].buttonParamsJson);
        expect(ib0.id).toBe("btn_check_payment");
        expect(ib1.id).toBe("btn_cancel_order");
    });

    it("should silently drop stale button clicks when session is IDLE", async () => {
        expect(state.getSession(testJid).step).toBe("IDLE");

        await handleIncomingMessage(testJid, false, "btn_confirm_order", mockContext);
        expect(sentTexts.length).toBe(0);
        expect(sentButtons.length).toBe(0);
        expect(sentImages.length).toBe(0);
        expect(sentLists.length).toBe(0);
    });

    it("should send welcome buttons on greeting and open category menu on btn_start_buying", async () => {
        state.clear(testJid);
        sentButtons = [];

        await handleIncomingMessage(testJid, false, "halo", mockContext);
        expect(sentButtons.length).toBe(1);
        const welcomeBtns = sentButtons[0]!.payload.interactiveMessage.nativeFlowMessage.buttons;
        expect(welcomeBtns.length).toBe(3);
        const b0 = JSON.parse(welcomeBtns[0].buttonParamsJson);
        const b1 = JSON.parse(welcomeBtns[1].buttonParamsJson);
        const b2 = JSON.parse(welcomeBtns[2].buttonParamsJson);
        expect(b0.id).toBe("btn_start_buying");
        expect(b1.id).toBe("btn_history");
        expect(b2.id).toBe("btn_settings");

        // Clicking btn_start_buying opens category menu statelessly
        sentLists = [];
        await handleIncomingMessage(testJid, false, "btn_start_buying", mockContext);
        expect(sentLists.length).toBe(1);
        expect(state.getSession(testJid).step).toBe("IDLE");
    });

    it("should handle cat_ clicks statelessly when session is IDLE", async () => {
        state.clear(testJid);
        expect(state.getSession(testJid).step).toBe("IDLE");
        sentImages = [];
        sentLists = [];

        await handleIncomingMessage(testJid, false, "cat_Regular Pet", mockContext);
        expect(sentImages.length).toBe(1);
        expect(sentLists.length).toBe(1);
        expect(state.getSession(testJid).step).toBe("IDLE");
    });

    it("should cancel order during active gamertag or confirmation step on btn_cancel_order", async () => {
        state.setItem(testJid, catalogItems[0]!);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");

        // Clicking cancel button during active order step cancels the session
        await handleIncomingMessage(testJid, false, "btn_cancel_order", mockContext);
        expect(state.getSession(testJid).step).toBe("IDLE");
        expect(sentTexts[sentTexts.length - 1]!.text).toContain("dibatalkan");
    });

    it("should NOT reset active buying session when greeting is received", async () => {
        state.setItem(testJid, catalogItems[0]!);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");

        sentButtons = [];
        sentTexts = [];

        // Sending greeting during active session does NOT clear session or send welcome buttons
        await handleIncomingMessage(testJid, false, "halo", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        expect(sentButtons.length).toBe(0);

        await handleIncomingMessage(testJid, false, "hi", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        expect(sentButtons.length).toBe(0);
    });

    it("should automatically expire buying flow after 5 minutes of inactivity", async () => {
        state.setItem(testJid, catalogItems[0]!);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");

        // Fast-forward session inactivity by 5 minutes + 1 second
        const session = state.getSession(testJid);
        session.lastUpdated = Date.now() - (5 * 60 * 1000 + 1000);

        // Getting session now should return fresh IDLE session
        const fresh = state.getSession(testJid);
        expect(fresh.step).toBe("IDLE");
    });

    it("should reply with welcome buttons to any text when IDLE with 5-second cooldown", async () => {
        state.clear(testJid);
        sentButtons = [];

        // 1. Casual arbitrary text when IDLE triggers greeting
        await handleIncomingMessage(testJid, false, "mau nanya dong kak", mockContext);
        expect(sentButtons.length).toBe(1);

        // 2. Rapid message within 5 seconds is dropped by cooldown
        await handleIncomingMessage(testJid, false, "p", mockContext);
        expect(sentButtons.length).toBe(1);

        // 3. After 5 seconds, message triggers greeting again
        state.setLastGreetingAt(testJid, Date.now() - 6000);
        await handleIncomingMessage(testJid, false, "halo", mockContext);
        expect(sentButtons.length).toBe(2);
    });

    it("should handle btn_history, btn_settings, act_switch_lang, and act_view_faq", async () => {
        state.clear(testJid);
        sentTexts = [];
        sentButtons = [];
        sentLists = [];

        // btn_settings opens settings drawer
        await handleIncomingMessage(testJid, false, "btn_settings", mockContext);
        expect(sentLists.length).toBe(1);
        expect(sentLists[0]!.payload.listMessage.title).toContain("Pengaturan");

        // act_switch_lang switches language to en and sends welcome buttons in English
        await handleIncomingMessage(testJid, false, "act_switch_lang", mockContext);
        expect(state.getLanguage(testJid)).toBe("en");
        expect(sentButtons.length).toBe(1);

        // act_view_faq sends FAQ text
        await handleIncomingMessage(testJid, false, "act_view_faq", mockContext);
        expect(sentTexts.length).toBeGreaterThanOrEqual(1);

        // btn_history queries user orders
        sentTexts = [];
        (mockContext.client as any).getUserOrders = async () => [];
        await handleIncomingMessage(testJid, false, "btn_history", mockContext);
        expect(sentTexts.length).toBe(1);
    });

    it("should lock user focus during AWAITING_GAMERTAG: block commands, reject random input as invalid gamertag, and drop stale buttons", async () => {
        state.clear(testJid);
        sentTexts = [];
        sentButtons = [];

        // 1. User selects item
        await handleIncomingMessage(testJid, false, "item_pet-1", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        const promptId = state.getPromptMessageId(testJid);
        expect(promptId).toBeDefined();

        sentTexts = [];
        sentButtons = [];

        // 2. User tries running /menu or /randome while in AWAITING_GAMERTAG
        await handleIncomingMessage(testJid, false, "/menu", mockContext);
        // Menu was NOT opened; instead, user received invalidGamertag prompt
        expect(sentButtons.length).toBe(0);
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]!.text).toContain("Gamertag tidak valid");

        sentTexts = [];
        await handleIncomingMessage(testJid, false, "/randome", mockContext);
        // Unrecognized command was NOT sent; user received invalidGamertag prompt
        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]!.text).not.toContain("tidak dikenali");
        expect(sentTexts[0]!.text).toContain("Gamertag tidak valid");

        // 3. User clicks old btn_check_payment while in AWAITING_GAMERTAG
        sentTexts = [];
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext);
        expect(sentTexts.length).toBe(0); // dropped, no response

        // 4. User clicks old btn_start_buying while in AWAITING_GAMERTAG
        sentButtons = [];
        await handleIncomingMessage(testJid, false, "btn_start_buying", mockContext);
        expect(sentButtons.length).toBe(0); // dropped
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
    });

    it("should drop stale interactive button clicks quoting older message stanzaId during active buying flow", async () => {
        state.clear(testJid);
        sentTexts = [];
        sentButtons = [];

        // 1. Select item to enter AWAITING_GAMERTAG
        await handleIncomingMessage(testJid, false, "item_pet-1", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        const currentPromptId = state.getPromptMessageId(testJid);
        expect(currentPromptId).toBeDefined();

        sentLists = [];

        // 2. Click button quoting an older message (e.g. from scrolled chat history)
        await handleIncomingMessage(testJid, false, "btn_modify_change_item", mockContext, undefined, undefined, "old-stale-stanza-id");
        // Must be silently dropped
        expect(sentLists.length).toBe(0);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");

        // 3. Click button quoting the CURRENT promptMessageId
        await handleIncomingMessage(testJid, false, "btn_modify_change_item", mockContext, undefined, undefined, currentPromptId);
        // Successfully processed: goes back to item list
        expect(sentLists.length).toBe(1);
        expect(state.getSession(testJid).step).toBe("IDLE");
    });

    it("should allow confirmation card buttons even after opening modify menu drawer (multiple valid active prompts) and sync category", async () => {
        state.clear(testJid);
        sentTexts = [];
        sentButtons = [];
        sentLists = [];

        // 1. User browses category 3 (Mounts)
        await handleIncomingMessage(testJid, false, "cat_Regular Mount", mockContext);
        expect(state.getSession(testJid).selectedCategory).toBe("Regular Mount");

        // 2. User selects item from category 1 (Main Store) e.g. item_boost-1
        (mockContext.client as any).getCatalog = async () => [
            { id: "boost-1", name: "1 Hour XP Boost", category: "Main Store", rupiahPrice: 10000, originalPrice: 20000, discountPercent: 50, active: true },
            { id: "mount-1", name: "Dragon Mount", category: "Regular Mount", rupiahPrice: 35000, originalPrice: 70000, discountPercent: 50, active: true }
        ];

        await handleIncomingMessage(testJid, false, "item_boost-1", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_GAMERTAG");
        expect(state.getSession(testJid).selectedCategory).toBe("Main Store");
        const gtPromptId = state.getPromptMessageId(testJid);

        // 3. User submits gamertag -> sends confirmation card
        await handleIncomingMessage(testJid, false, "SteveGamer", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_CONFIRMATION");
        const confirmPromptId = state.getPromptMessageId(testJid);
        expect(confirmPromptId).toBeDefined();
        expect(confirmPromptId).not.toBe(gtPromptId);

        // 4. Old gamertag button quoting gtPromptId must be ignored as stale
        sentLists = [];
        await handleIncomingMessage(testJid, false, "btn_modify_change_item", mockContext, undefined, undefined, gtPromptId);
        expect(sentLists.length).toBe(0);
        expect(state.getSession(testJid).step).toBe("AWAITING_CONFIRMATION");

        // 5. User opens modify drawer menu [Ubah / Batalkan] quoting confirmPromptId
        sentLists = [];
        await handleIncomingMessage(testJid, false, "btn_modify_menu", mockContext, undefined, undefined, confirmPromptId);
        expect(sentLists.length).toBe(1);
        expect(sentLists[0]!.payload.listMessage.title).toContain("Ubah");

        // 6. User clicks [Pakai Voucher] quoting the ORIGINAL confirmation message confirmPromptId
        // This MUST NOT be dropped as stale!
        sentButtons = [];
        await handleIncomingMessage(testJid, false, "btn_open_voucher", mockContext, undefined, undefined, confirmPromptId);
        expect(sentButtons.length).toBe(1);
        expect(state.getSession(testJid).step).toBe("AWAITING_VOUCHER_CODE");

        // 7. User cancels voucher input -> returns to confirmation
        await handleIncomingMessage(testJid, false, "btn_cancel_voucher", mockContext);
        expect(state.getSession(testJid).step).toBe("AWAITING_CONFIRMATION");
        const newConfirmId = state.getPromptMessageId(testJid);

        // 8. User opens modify drawer again, then selects opt_change_item
        await handleIncomingMessage(testJid, false, "btn_modify_menu", mockContext, undefined, undefined, newConfirmId);
        const modifyListId = state.getPromptMessageId(testJid);

        sentLists = [];
        await handleIncomingMessage(testJid, false, "opt_change_item", mockContext, undefined, undefined, modifyListId);
        expect(sentLists.length).toBe(1);
        // It must open Main Store catalog, NOT Mounts!
        expect(sentLists[0]!.payload.listMessage.title).toContain("Main Store");
        expect(state.getSession(testJid).step).toBe("IDLE");

        // 9. User selects a different item (mount-1)
        sentButtons = [];
        sentTexts = [];
        await handleIncomingMessage(testJid, false, "item_mount-1", mockContext);
        // It must NOT ask for gamertag again! It must directly send confirmation buttons!
        expect(state.getSession(testJid).step).toBe("AWAITING_CONFIRMATION");
        expect(sentButtons.length).toBe(1);
        expect(sentButtons[0]!.payload.interactiveMessage.body.text).toContain("Dragon Mount");
        expect(sentButtons[0]!.payload.interactiveMessage.body.text).toContain("SteveGamer");
    });

    it("should lock user focus during PENDING_PAYMENT: ignore menu/random commands/old buttons, drop normal user slash commands, allow btn_check_payment and btn_cancel_order", async () => {
        state.clear(testJid);
        state.startBuyingFlow(testJid);
        state.setCategory(testJid, "Regular Pet");
        state.setItem(testJid, catalogItems[0]!);
        state.setGamertag(testJid, "SteveGamer");

        sentTexts = [];
        sentButtons = [];
        sentImages = [];

        // Confirm order -> generates invoice & QR, sets activeOrderId
        await handleIncomingMessage(testJid, false, "btn_confirm_order", mockContext);
        const activeOrderId = state.getActiveOrderId(testJid);
        expect(activeOrderId).toBe("ORD-TEST99");

        sentTexts = [];
        sentButtons = [];
        sentLists = [];

        // 1. Slash commands like /menu or /random are silently dropped
        await handleIncomingMessage(testJid, false, "/menu", mockContext);
        expect(sentTexts.length).toBe(0);
        expect(sentButtons.length).toBe(0);

        await handleIncomingMessage(testJid, false, "/random", mockContext);
        expect(sentTexts.length).toBe(0);

        // 2. Old buttons like cat_Pets or btn_start_buying are silently dropped
        await handleIncomingMessage(testJid, false, "cat_Pets", mockContext);
        expect(sentLists.length).toBe(0);

        await handleIncomingMessage(testJid, false, "btn_start_buying", mockContext);
        expect(sentButtons.length).toBe(0);

        // 3. Random text or greetings are ignored (no greeting sent)
        await handleIncomingMessage(testJid, false, "halo", mockContext);
        expect(sentButtons.length).toBe(0);

        // 4. Slash commands like /cek and /batal from normal users are completely disabled (dropped)
        (mockContext.client as any).getOrders = async () => [
            { id: "ORD-TEST99", status: "PENDING_PAYMENT", itemName: "Pet Wolf", gamertag: "SteveGamer" }
        ];
        await handleIncomingMessage(testJid, false, "/cek", mockContext);
        expect(sentTexts.length).toBe(0);

        await handleIncomingMessage(testJid, false, "/batal", mockContext);
        expect(sentTexts.length).toBe(0);

        // 5. Normal user checks payment via quick-reply button [Cek Pembayaran]
        await handleIncomingMessage(testJid, false, "btn_check_payment", mockContext);
        expect(sentTexts.length).toBeGreaterThanOrEqual(1);

        // 6. Normal user cancels order via quick-reply button [Batalkan Pesanan]
        sentTexts = [];
        (mockContext.client as any).cancelOrder = async () => ({ orderId: "ORD-TEST99", status: "CANCELLED" });
        await handleIncomingMessage(testJid, false, "btn_cancel_order", mockContext);
        expect(sentTexts.length).toBeGreaterThanOrEqual(1);
        expect(state.getActiveOrderId(testJid)).toBeUndefined();
    });
});

