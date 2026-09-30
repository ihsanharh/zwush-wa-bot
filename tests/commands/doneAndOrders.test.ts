import { describe, expect, it, mock } from "bun:test";
import { doneCommand } from "../../src/commands/admin/done";
import { ordersCommand } from "../../src/commands/admin/orders";
import type { CommandContext } from "../../src/commands/types";

describe("Admin Commands: /done and /orders", () => {
    it("/done should display usage when no arguments provided and no orders available", async () => {
        let sentText = "";
        const mockCtx: CommandContext = {
            remoteJid: "admin@s.whatsapp.net",
            sender: "admin@s.whatsapp.net",
            args: [],
            rawText: "/done",
            isGroup: false,
            isAdmin: true,
            userLang: "id",
            ctx: {
                client: {} as any,
                state: {} as any,
                sendText: mock(async (_jid, text) => {
                    sentText = text;
                }),
                sendImage: mock(async () => {}),
            },
        };

        await doneCommand.execute(mockCtx);
        expect(sentText).toContain("Format Perintah /done");
    });

    it("/done should call manualCompleteOrder and report success", async () => {
        let sentText = "";
        const manualCompleteMock = mock(async (id: string, options?: { silent?: boolean }) => ({
            success: true,
            orderId: id,
            status: "SUCCESS",
            gamertag: "Wellingsun",
            itemName: "Ultimate Rank",
            totalNominal: 55000,
            silent: options?.silent ?? false,
        }));

        const mockCtx: CommandContext = {
            remoteJid: "admin@s.whatsapp.net",
            sender: "admin@s.whatsapp.net",
            args: ["ORD-YK6BM7"],
            rawText: "/done ORD-YK6BM7",
            isGroup: false,
            isAdmin: true,
            userLang: "id",
            ctx: {
                client: {
                    manualCompleteOrder: manualCompleteMock,
                } as any,
                state: {} as any,
                sendText: mock(async (_jid, text) => {
                    sentText = text;
                }),
                sendImage: mock(async () => {}),
            },
        };

        await doneCommand.execute(mockCtx);
        expect(manualCompleteMock).toHaveBeenCalledWith("ORD-YK6BM7", { silent: false });
        expect(sentText).toContain("ORDER BERHASIL DISELESAIKAN SECARA MANUAL");
        expect(sentText).toContain("Wellingsun");
        expect(sentText).toContain("ORD-YK6BM7");
    });

    it("/done with -s should call manualCompleteOrder with silent: true", async () => {
        let sentText = "";
        const manualCompleteMock = mock(async (id: string, options?: { silent?: boolean }) => ({
            success: true,
            orderId: id,
            status: "SUCCESS",
            gamertag: "Wellingsun",
            itemName: "Ultimate Rank",
            totalNominal: 55000,
            silent: options?.silent ?? false,
        }));

        const mockCtx: CommandContext = {
            remoteJid: "admin@s.whatsapp.net",
            sender: "admin@s.whatsapp.net",
            args: ["ORD-YK6BM7", "-s"],
            rawText: "/done ORD-YK6BM7 -s",
            isGroup: false,
            isAdmin: true,
            userLang: "id",
            ctx: {
                client: {
                    manualCompleteOrder: manualCompleteMock,
                } as any,
                state: {} as any,
                sendText: mock(async (_jid, text) => {
                    sentText = text;
                }),
                sendImage: mock(async () => {}),
            },
        };

        await doneCommand.execute(mockCtx);
        expect(manualCompleteMock).toHaveBeenCalledWith("ORD-YK6BM7", { silent: true });
        expect(sentText).toContain("SILENT");
        expect(sentText).toContain("tanpa mengirim notifikasi");
    });

    it("/done without ID should automatically resolve latest unfinished order", async () => {
        let sentText = "";
        const manualCompleteMock = mock(async (id: string, options?: { silent?: boolean }) => ({
            success: true,
            orderId: id,
            status: "SUCCESS",
            gamertag: "PlayerLatest",
            itemName: "Dragon Pet",
            totalNominal: 25000,
            silent: options?.silent ?? false,
        }));
        const listOrdersMock = mock(async () => ({
            count: 2,
            orders: [
                { id: "ORD-LATEST", status: "FAILED", gamertag: "PlayerLatest", itemName: "Dragon Pet" },
                { id: "ORD-OLD", status: "SUCCESS", gamertag: "PlayerOld", itemName: "Costume" },
            ],
        }));

        const mockCtx: CommandContext = {
            remoteJid: "admin@s.whatsapp.net",
            sender: "admin@s.whatsapp.net",
            args: ["-s"],
            rawText: "/done -s",
            isGroup: false,
            isAdmin: true,
            userLang: "id",
            ctx: {
                client: {
                    listOrders: listOrdersMock,
                    manualCompleteOrder: manualCompleteMock,
                } as any,
                state: {} as any,
                sendText: mock(async (_jid, text) => {
                    sentText = text;
                }),
                sendImage: mock(async () => {}),
            },
        };

        await doneCommand.execute(mockCtx);
        expect(manualCompleteMock).toHaveBeenCalledWith("ORD-LATEST", { silent: true });
        expect(sentText).toContain("ORD-LATEST");
        expect(sentText).toContain("SILENT");
    });

    it("/done all -s should call manualCompleteAllOrders", async () => {
        let sentText = "";
        const manualCompleteAllMock = mock(async (options?: { silent?: boolean }) => ({
            success: true,
            count: 3,
            orderIds: ["ORD-1", "ORD-2", "ORD-3"],
            silent: options?.silent ?? false,
        }));

        const mockCtx: CommandContext = {
            remoteJid: "admin@s.whatsapp.net",
            sender: "admin@s.whatsapp.net",
            args: ["all", "-s"],
            rawText: "/done all -s",
            isGroup: false,
            isAdmin: true,
            userLang: "id",
            ctx: {
                client: {
                    manualCompleteAllOrders: manualCompleteAllMock,
                } as any,
                state: {} as any,
                sendText: mock(async (_jid, text) => {
                    sentText = text;
                }),
                sendImage: mock(async () => {}),
            },
        };

        await doneCommand.execute(mockCtx);
        expect(manualCompleteAllMock).toHaveBeenCalledWith({ silent: true });
        expect(sentText).toContain("3 PESANAN BERHASIL DISELESAIKAN (SILENT)");
    });

    it("/orders should list orders with filters", async () => {
        let sentText = "";
        const listOrdersMock = mock(async (status?: string, limit?: number) => ({
            count: 1,
            orders: [
                {
                    id: "ORD-YK6BM7",
                    gamertag: "Wellingsun",
                    itemName: "Hive+ to Ultimate Upgrade",
                    status: "FAILED",
                    totalNominal: 55000,
                    createdAt: "2026-09-28T06:20:00.000Z",
                    failureReason: "Recipient is not Hive+ (requires 22 tokens, max allowed 11 tokens)",
                },
            ],
        }));

        const mockCtx: CommandContext = {
            remoteJid: "admin@s.whatsapp.net",
            sender: "admin@s.whatsapp.net",
            args: ["failed"],
            rawText: "/orders failed",
            isGroup: false,
            isAdmin: true,
            userLang: "id",
            ctx: {
                client: {
                    listOrders: listOrdersMock,
                } as any,
                state: {} as any,
                sendText: mock(async (_jid, text) => {
                    sentText = text;
                }),
                sendImage: mock(async () => {}),
            },
        };

        await ordersCommand.execute(mockCtx);
        expect(listOrdersMock).toHaveBeenCalledWith("FAILED", 10);
        expect(sentText).toContain("DAFTAR ORDER");
        expect(sentText).toContain("ORD-YK6BM7");
        expect(sentText).toContain("FAILED");
        expect(sentText).toContain("Wellingsun");
    });
});
