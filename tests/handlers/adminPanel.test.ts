import { describe, it, expect, beforeEach, mock } from "bun:test";
import { handleIncomingMessage, type BotContext } from "../../src/handlers/message";
import { AdminGroupLogger } from "../../src/handlers/adminLogger";
import { StateManager } from "../../src/state";

describe("Interactive Admin Panel System", () => {
    let state: StateManager;
    let sentTexts: { jid: string; text: string; mentions?: string[] }[];
    let sentLists: { jid: string; payload: any }[];
    let sentButtons: { jid: string; payload: any }[];
    let mockContext: BotContext;
    const adminGroupJid = "12036304@g.us";
    const logGroupJid = "12036305@g.us";
    const adminUser = "628999999999@s.whatsapp.net";
    const nonAdminUser = "628111111111@s.whatsapp.net";
    const botJid = "628222222222@s.whatsapp.net";
    const botLid = "205626525360219@lid";

    beforeEach(() => {
        state = new StateManager();
        sentTexts = [];
        sentLists = [];
        sentButtons = [];

        const adminLogger = new AdminGroupLogger(
            { adminGroupJid, logGroupJid },
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
            botLid,
            client: {
                getBalance: mock(async (refresh?: boolean) => ({
                    bot: {
                        gamertag: "ZwushBot",
                        tokens: 150,
                        costumeTokens: 25,
                        status: "ONLINE"
                    },
                    summary: {
                        todayCompleted: 12,
                        todayRevenue: 250000,
                        pendingPayment: 2,
                        giftingQueue: 1,
                        insufficientTokens: 0,
                        discountPercent: 10,
                        activeVouchers: 5
                    }
                })),
                syncCatalog: mock(async () => ({ success: true, count: 50 }))
            } as any,
            sendText: async (jid: string, text: string, mentions?: string[]) => {
                sentTexts.push({ jid, text, mentions });
            },
            sendList: async (jid: string, payload: any) => {
                sentLists.push({ jid, payload });
            },
            sendButtons: async (jid: string, payload: any) => {
                sentButtons.push({ jid, payload });
            },
            sendImage: async () => ({})
        };
    });

    describe("Triggering Admin Panel via Real WhatsApp Bot Mentions", () => {
        it("should open Admin Panel when admin mentions bot phone number @628222222222 in text", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "@628222222222",
                mockContext,
                adminUser
            );

            expect(sentLists.length).toBe(1);
            expect(sentLists[0]?.jid).toBe(adminGroupJid);
            expect(sentLists[0]?.payload.listMessage.title).toContain("Panel Kontrol Admin");
        });

        it("should open Admin Panel when message contains bot in WhatsApp mentionedJids array", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "buka panel ya",
                mockContext,
                adminUser,
                undefined,
                undefined,
                [botJid]
            );

            expect(sentLists.length).toBe(1);
            expect(sentLists[0]?.jid).toBe(adminGroupJid);
        });

        it("should open Admin Panel when admin mentions bot LID in text @205626525360219", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "@205626525360219",
                mockContext,
                adminUser
            );

            expect(sentLists.length).toBe(1);
            expect(sentLists[0]?.jid).toBe(adminGroupJid);
            expect(sentLists[0]?.payload.listMessage.title).toContain("Panel Kontrol Admin");
        });

        it("should open Admin Panel when message contains bot in WhatsApp mentionedJids array with LID", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "buka panel",
                mockContext,
                adminUser,
                undefined,
                undefined,
                [botLid]
            );

            expect(sentLists.length).toBe(1);
            expect(sentLists[0]?.jid).toBe(adminGroupJid);
        });

        it("should open Admin Panel when admin types just '@' in admin group", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "@",
                mockContext,
                adminUser
            );

            expect(sentLists.length).toBe(1);
            expect(sentLists[0]?.jid).toBe(adminGroupJid);
        });

        it("should fallback to QuickReply buttons if sendList throws an error in group", async () => {
            mockContext.sendList = async () => {
                throw new Error("List message not supported in this chat");
            };

            await handleIncomingMessage(
                adminGroupJid,
                false,
                "@205626525360219",
                mockContext,
                adminUser
            );

            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.jid).toBe(adminGroupJid);
        });

        it("should NOT open Admin Panel on literal '@bot' text when not mentioning bot number", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "@bot",
                mockContext,
                adminUser
            );

            expect(sentLists.length).toBe(0);
            expect(sentButtons.length).toBe(0);
        });

        it("should NOT open Admin Panel on keyword commands like 'panel', '/panel', 'admin', or '/admin'", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "panel",
                mockContext,
                adminUser
            );
            expect(sentLists.length).toBe(0);

            await handleIncomingMessage(
                adminGroupJid,
                false,
                "/panel",
                mockContext,
                adminUser
            );
            expect(sentLists.length).toBe(0);

            await handleIncomingMessage(
                adminGroupJid,
                false,
                "admin",
                mockContext,
                adminUser
            );
            expect(sentLists.length).toBe(0);
        });

        it("should NOT open Admin Panel when mentioning a different member", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "@628111111111 tolong cek",
                mockContext,
                adminUser,
                undefined,
                undefined,
                ["628111111111@s.whatsapp.net"]
            );

            expect(sentLists.length).toBe(0);
            expect(sentButtons.length).toBe(0);
        });

        it("should fallback to QuickReply buttons if sendList is not available when bot is mentioned", async () => {
            const ctxWithoutList = { ...mockContext, sendList: undefined };
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "@628222222222",
                ctxWithoutList,
                adminUser
            );

            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.payload.text).toContain("PANEL KONTROL ADMIN");
        });

        it("should NOT open Admin Panel on regular conversation in admin group without bot tag", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "halo teman-teman gimana kabar",
                mockContext,
                adminUser
            );

            expect(sentLists.length).toBe(0);
            expect(sentButtons.length).toBe(0);
            expect(sentTexts.length).toBe(0);
        });

        it("should NOT open Admin Panel in non-authorized groups", async () => {
            await handleIncomingMessage(
                "1203999999@g.us",
                false,
                "@bot",
                mockContext,
                adminUser
            );

            expect(sentLists.length).toBe(0);
            expect(sentButtons.length).toBe(0);
        });
    });

    describe("Admin Panel Interactive Actions", () => {
        it("should handle 'admin_panel_balance' action and show balance summary", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "admin_panel_balance",
                mockContext,
                adminUser
            );

            expect(mockContext.client.getBalance).toHaveBeenCalledWith(false);
            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.payload.text).toContain("SALDO & STATUS BOT");
            expect(sentButtons[0]?.payload.text).toContain("150 Token");
        });

        it("should handle 'btn_admin_balance_refresh' and force-refresh balance", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "btn_admin_balance_refresh",
                mockContext,
                adminUser
            );

            expect(mockContext.client.getBalance).toHaveBeenCalledWith(true);
            expect(sentButtons.length).toBe(1);
        });

        it("should handle 'admin_panel_maintenance' and show toggle buttons", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "admin_panel_maintenance",
                mockContext,
                adminUser
            );

            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.payload.text).toContain("STATUS MAINTENANCE");
            expect(sentButtons[0]?.payload.buttons[0]?.id).toBe("btn_admin_maint_on");
        });

        it("should toggle maintenance ON with 'btn_admin_maint_on'", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "btn_admin_maint_on",
                mockContext,
                adminUser
            );

            expect(state.isMaintenanceMode()).toBe(true);
            expect(sentTexts[0]?.text).toContain("DIAKTIFKAN");
            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.payload.buttons[0]?.id).toBe("btn_admin_maint_off");
        });

        it("should toggle maintenance OFF with 'btn_admin_maint_off'", async () => {
            state.setMaintenanceMode(true);
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "btn_admin_maint_off",
                mockContext,
                adminUser
            );

            expect(state.isMaintenanceMode()).toBe(false);
            expect(sentTexts[0]?.text).toContain("DINONAKTIFKAN");
            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.payload.buttons[0]?.id).toBe("btn_admin_maint_on");
        });

        it("should handle 'admin_panel_sync' and trigger catalog synchronization", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "admin_panel_sync",
                mockContext,
                adminUser
            );

            expect(mockContext.client.syncCatalog).toHaveBeenCalled();
            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.payload.text).toContain("SINKRONISASI KATALOG");
        });

        it("should handle 'admin_panel_orders' and show order counts", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "admin_panel_orders",
                mockContext,
                adminUser
            );

            expect(mockContext.client.getBalance).toHaveBeenCalled();
            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.payload.text).toContain("DAFTAR PESANAN");
            expect(sentButtons[0]?.payload.text).toContain("Selesai Hari Ini: *12*");
        });

        it("should handle 'admin_panel_vouchers' and show voucher details", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "admin_panel_vouchers",
                mockContext,
                adminUser
            );

            expect(mockContext.client.getBalance).toHaveBeenCalled();
            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.payload.text).toContain("VOUCHER & DISKON");
            expect(sentButtons[0]?.payload.text).toContain("Diskon Global Toko: *10%*");
        });

        it("should return to main menu when clicking 'btn_admin_panel'", async () => {
            await handleIncomingMessage(
                adminGroupJid,
                false,
                "btn_admin_panel",
                mockContext,
                adminUser
            );

            expect(sentLists.length).toBe(1);
            expect(sentLists[0]?.payload.listMessage.title).toContain("Panel Kontrol Admin");
        });

        it("should fallback to QuickReply buttons if sendList throws an error when clicking 'btn_admin_panel'", async () => {
            mockContext.sendList = async () => {
                throw new Error("negative publish ack: error=479");
            };

            await handleIncomingMessage(
                adminGroupJid,
                false,
                "btn_admin_panel",
                mockContext,
                adminUser
            );

            expect(sentButtons.length).toBe(1);
            expect(sentButtons[0]?.jid).toBe(adminGroupJid);
        });
    });
});
