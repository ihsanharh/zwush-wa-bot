import { describe, expect, it, mock, beforeEach } from "bun:test";
import { handleIncomingMessage, type BotContext } from "../../src/handlers/message";
import { StateManager } from "../../src/state";
import { AdminGroupLogger, type GroupMessageSender } from "../../src/handlers/adminLogger";
import { CoreClient } from "../../src/coreClient";

describe("Maintenance Mode & Admin Recognition", () => {
    let sentTexts: Array<{ jid: string; text: string }> = [];
    let sentButtons: Array<{ jid: string; payload: any }> = [];
    let state: StateManager;
    let adminLogger: AdminGroupLogger;
    let ctx: BotContext;

    beforeEach(() => {
        sentTexts = [];
        sentButtons = [];
        state = new StateManager();

        const mockSender: GroupMessageSender = {
            sendMessage: mock(async () => ({ key: { id: "test" } })),
            editMessage: mock(async () => {})
        };

        adminLogger = new AdminGroupLogger(
            {
                logGroupJid: "12345-logs@g.us",
                adminGroupJid: "12345-admin@g.us"
            },
            mockSender
        );

        ctx = {
            client: new CoreClient("http://localhost:3000"),
            state,
            adminLogger,
            botJid: "628222222222@s.whatsapp.net",
            sendText: async (jid: string, text: string) => {
                sentTexts.push({ jid, text });
            },
            sendButtons: async (jid: string, payload: any) => {
                sentButtons.push({ jid, payload });
            },
            sendImage: async () => {},
            sendList: async () => {}
        };
    });

    it("should respond normally when maintenance mode is OFF", async () => {
        state.setMaintenanceMode(false);
        const normalUserJid = "628999888777@s.whatsapp.net";

        await handleIncomingMessage(normalUserJid, false, "Hai", ctx);

        expect(sentButtons.length).toBe(1);
        expect(sentTexts.length).toBe(0);
    });

    it("should send maintenance notice to non-admin in private chat when ON, and enforce 5s cooldown", async () => {
        state.setMaintenanceMode(true);
        const normalUserJid = "628999888777@s.whatsapp.net";

        // 1. First message: receives maintenance notice
        await handleIncomingMessage(normalUserJid, false, "Hai kak", ctx);

        expect(sentTexts.length).toBe(1);
        expect(sentTexts[0]?.jid).toBe(normalUserJid);
        expect(sentTexts[0]?.text).toContain("PEMELIHARAAN");
        expect(sentButtons.length).toBe(0); // No greetings or welcome buttons!

        // 2. Second message within 5 seconds: silently dropped
        await handleIncomingMessage(normalUserJid, false, "P", ctx);
        expect(sentTexts.length).toBe(1); // Still 1, not spammed!
    });

    it("should silently ignore non-admin users in groups during maintenance mode", async () => {
        state.setMaintenanceMode(true);
        const groupJid = "some-public-group@g.us";
        const participantJid = "628999888777@s.whatsapp.net";

        await handleIncomingMessage(groupJid, false, "Hello", ctx, participantJid);

        expect(sentTexts.length).toBe(0);
        expect(sentButtons.length).toBe(0);
    });

    it("should allow admin participant 28948566155371@lid from admin group to chat normally even during maintenance mode", async () => {
        state.setMaintenanceMode(true);
        const ownerLid = "28948566155371@lid";
        adminLogger.addAdminParticipants([ownerLid]);

        // Admin sends greeting
        await handleIncomingMessage(ownerLid, false, "Hai", ctx);

        // Should receive welcome buttons normally!
        expect(sentButtons.length).toBe(1);
        expect(sentTexts.length).toBe(0);
    });

    it("should allow any participant from ZwushAdmin group to chat in private even during maintenance mode", async () => {
        state.setMaintenanceMode(true);
        const adminMemberJid = "628111222333@s.whatsapp.net";
        const adminMemberLid = "9876543210@lid";

        // 1. Simulate admin member being part of ZwushAdmin group roster
        adminLogger.addAdminParticipants([
            { jid: adminMemberJid, lid: adminMemberLid, phoneNumber: "628111222333" }
        ]);

        // 2. When they chat in private using their phone JID
        await handleIncomingMessage(adminMemberJid, false, "Hai", ctx);
        expect(sentButtons.length).toBe(1);
        expect(sentTexts.length).toBe(0);

        // 3. When they chat in private using their LID
        await handleIncomingMessage(adminMemberLid, false, "Hai", ctx);
        expect(sentButtons.length).toBe(2);
    });

    it("should dynamically register participant as admin when they speak in the Admin Group", async () => {
        state.setMaintenanceMode(true);
        const adminGroupJid = "12345-admin@g.us";
        const newAdminParticipant = "628555444333@s.whatsapp.net";

        // 1. Mention bot number in admin group to open admin panel
        await handleIncomingMessage(
            adminGroupJid,
            false,
            "@628222222222",
            ctx,
            newAdminParticipant,
            undefined,
            undefined,
            ["628222222222@s.whatsapp.net"]
        );

        // 2. Now the participant chats in private 1:1 chat -> bot should recognize them!
        sentTexts = [];
        sentButtons = [];
        await handleIncomingMessage(newAdminParticipant, false, "Hai", ctx);

        expect(sentButtons.length).toBe(1); // Receives normal welcome buttons, not maintenance!
        expect(sentTexts.length).toBe(0);
    });

    it("should allow admins to toggle maintenance mode on and off via interactive buttons in admin group", async () => {
        const adminGroupJid = "12345-admin@g.us";
        const adminLid = "28948566155371@lid";
        adminLogger.addAdminParticipants([adminLid]);
        const normalUserJid = "628999888777@s.whatsapp.net";

        // 1. Turn ON maintenance mode in admin group via button
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_maint_on", ctx, adminLid);
        expect(state.isMaintenanceMode()).toBe(true);
        expect(sentTexts[0]?.text).toContain("DIAKTIFKAN");

        // 2. Normal user gets maintenance notice
        sentTexts = [];
        await handleIncomingMessage(normalUserJid, false, "Halo", ctx);
        expect(sentTexts[0]?.text).toContain("PEMELIHARAAN");

        // 3. Turn OFF maintenance mode in admin group via button
        sentTexts = [];
        await handleIncomingMessage(adminGroupJid, false, "btn_admin_maint_off", ctx, adminLid);
        expect(state.isMaintenanceMode()).toBe(false);
        expect(sentTexts[0]?.text).toContain("DINONAKTIFKAN");

        // 4. Normal user gets normal welcome buttons
        sentTexts = [];
        sentButtons = [];
        // Advance time beyond 5s for greeting
        state.setLastGreetingAt(normalUserJid, 0);
        await handleIncomingMessage(normalUserJid, false, "Halo", ctx);
        expect(sentButtons.length).toBe(1);
    });

    it("should NOT execute slash commands in private chat even when sent by admin (treated as normal user)", async () => {
        const adminLid = "28948566155371@lid";
        adminLogger.addAdminParticipants([adminLid]);

        // When admin sends /bantuan or /menu in private chat:
        // It must NOT execute command (no command text sent), but sends welcome buttons because session is IDLE!
        await handleIncomingMessage(adminLid, false, "/bantuan", ctx);
        expect(sentButtons.length).toBe(1);
        expect(sentTexts.length).toBe(0);

        // If sent again within 5s cooldown, it is dropped silently (not executing command)
        sentButtons = [];
        await handleIncomingMessage(adminLid, false, "/menu", ctx);
        expect(sentButtons.length).toBe(0);
        expect(sentTexts.length).toBe(0);
    });
});
