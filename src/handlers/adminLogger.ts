import type { OrderStatus } from "../types";
import { config } from "../config";

export interface GroupMessageSender {
    sendMessage(jid: string, content: string | { type: string; text: string; contextInfo?: any }): Promise<any>;
    editMessage(jid: string, key: any, newText: string): Promise<any>;
}

export interface OrderLogEntry {
    orderId: string;
    itemName: string;
    gamertag: string;
    totalNominal: number;
    platformUserId: string;
    status: OrderStatus;
    failureReason?: string;
    messageKey?: any;
}

export interface AdminGroupLoggerOptions {
    logGroupJid?: string;
    adminGroupJid?: string;
}

export class AdminGroupLogger {
    private logGroupJid: string;
    private adminGroupJid: string;
    private readonly sender: GroupMessageSender;
    private readonly orders = new Map<string, OrderLogEntry>();

    constructor(
        logOrConfig: string | AdminGroupLoggerOptions,
        sender: GroupMessageSender,
        legacyAdminGroupJid?: string
    ) {
        if (typeof logOrConfig === "string") {
            this.logGroupJid = logOrConfig;
            this.adminGroupJid = legacyAdminGroupJid || "";
        } else {
            this.logGroupJid = logOrConfig.logGroupJid || "";
            this.adminGroupJid = logOrConfig.adminGroupJid || "";
        }
        this.sender = sender;
    }

    setLogGroupJid(jid: string): void {
        this.logGroupJid = jid;
    }

    getLogGroupJid(): string {
        return this.logGroupJid;
    }

    setAdminGroupJid(jid: string): void {
        this.adminGroupJid = jid;
    }

    getAdminGroupJid(): string {
        return this.adminGroupJid;
    }

    setGroupJid(jid: string): void {
        this.logGroupJid = jid;
    }

    getGroupJid(): string {
        return this.logGroupJid;
    }

    private formatStatusBadge(status: OrderStatus, failureReason?: string): string {
        switch (status) {
            case "PENDING_PAYMENT":
                return "⏳ Menunggu Pembayaran";
            case "QUEUED":
                return "💳 Pembayaran Diterima / Dalam Antrean";
            case "GIFTING":
                return "🎁 Sedang Dikirim ke In-Game (The Hive)";
            case "SUCCESS":
                return "✅ Selesai Dikirim (COMPLETED)";
            case "INSUFFICIENT_TOKENS":
                return "⚠️ Token Kurang / Menunggu Restock";
            case "EXPIRED":
                return "⏱️ Kedaluwarsa (Batal)";
            case "FAILED":
                return `❌ Gagal: ${failureReason || "Tidak Diketahui"}`;
            default:
                return status;
        }
    }

    private formatLogMessage(entry: OrderLogEntry): string {
        const cleanPhone = entry.platformUserId.replace(/[^0-9]/g, "");
        const statusBadge = this.formatStatusBadge(entry.status, entry.failureReason);

        let out = `📦 *ORDER BARU — ${config.STORE_NAME.toUpperCase()}*\n\n`;
        out += `🆔 ID: *#${entry.orderId}*\n`;
        out += `🛍️ Item: *${entry.itemName}*\n`;
        out += `👤 Gamertag: *${entry.gamertag}*\n`;
        out += `💰 Total: *Rp ${entry.totalNominal.toLocaleString("id-ID")}*\n`;
        if (cleanPhone) {
            out += `📱 Pembeli: wa.me/${cleanPhone}\n`;
        }
        out += `📊 Status: *${statusBadge}*`;

        return out;
    }

    async logNewOrder(order: {
        orderId: string;
        itemName: string;
        gamertag: string;
        totalNominal: number;
        platformUserId: string;
    }): Promise<void> {
        if (!this.logGroupJid) return;

        const entry: OrderLogEntry = {
            ...order,
            status: "PENDING_PAYMENT"
        };

        const messageText = this.formatLogMessage(entry);

        try {
            const sent = await this.sender.sendMessage(this.logGroupJid, messageText);
            // zapo-js returns { id: string } or test returns { key: { id, remoteJid, fromMe } }
            const messageKey =
                sent?.key ??
                (sent?.id ? { id: sent.id, remoteJid: this.logGroupJid, fromMe: true } : undefined);

            if (messageKey) {
                entry.messageKey = messageKey;
            }
            this.orders.set(order.orderId, entry);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[AdminGroupLogger] Error sending log for order #${order.orderId}:`, msg);
        }
    }

    async updateOrderStatus(
        orderId: string,
        status: OrderStatus,
        extra?: { failureReason?: string; itemName?: string; gamertag?: string; platformUserId?: string }
    ): Promise<void> {
        if (!this.logGroupJid) return;

        const entry = this.orders.get(orderId);

        // If order was not in memory (e.g. after bot restart), send status update to group
        if (!entry) {
            const statusBadge = this.formatStatusBadge(status, extra?.failureReason);
            let updateMsg = `🔔 *UPDATE STATUS PESANAN — ${config.STORE_NAME.toUpperCase()}*\n\n`;
            updateMsg += `🆔 ID: *#${orderId}*\n`;
            if (extra?.itemName) updateMsg += `🛍️ Item: *${extra.itemName}*\n`;
            if (extra?.gamertag) updateMsg += `👤 Gamertag: *${extra.gamertag}*\n`;
            if (extra?.platformUserId) {
                const cleanPhone = extra.platformUserId.replace(/[^0-9]/g, "");
                if (cleanPhone) updateMsg += `📱 Pembeli: wa.me/${cleanPhone}\n`;
            }
            updateMsg += `📊 Status: *${statusBadge}*`;

            try {
                await this.sender.sendMessage(this.logGroupJid, updateMsg);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[AdminGroupLogger] Error sending fallback status update for order #${orderId}:`, msg);
            }
            return;
        }

        entry.status = status;
        if (extra?.failureReason) {
            entry.failureReason = extra.failureReason;
        }

        const updatedText = this.formatLogMessage(entry);

        if (entry.messageKey) {
            try {
                await this.sender.editMessage(this.logGroupJid, entry.messageKey, updatedText);
                return;
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[AdminGroupLogger] Edit failed for order #${orderId}, falling back to new message:`, msg);
            }
        }

        // Fallback: send as new message if no messageKey or if editMessage failed
        try {
            await this.sender.sendMessage(this.logGroupJid, updatedText);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[AdminGroupLogger] Error sending fallback log for order #${orderId}:`, msg);
        }
    }

    async notifyInsufficientTokens(order: {
        orderId: string;
        itemName: string;
        gamertag: string;
        adminPhone: string;
    }): Promise<void> {
        const targetJids = new Set<string>();
        if (this.adminGroupJid) targetJids.add(this.adminGroupJid);
        if (this.logGroupJid) targetJids.add(this.logGroupJid);
        if (targetJids.size === 0) return;

        const cleanPhone = order.adminPhone.replace(/[^0-9]/g, "");
        const adminJid = `${cleanPhone}@s.whatsapp.net`;
        const alertText = (
            `@${cleanPhone} ⚠️ *PERHATIAN ADMIN — RESTOCK TOKEN DIBUTUHKAN!*\n\n` +
            `Pesanan *#${order.orderId}* (*${order.itemName}* untuk Gamertag *${order.gamertag}*) tertahan karena stok token Gibot kurang.\n\n` +
            `👉 Silakan restock token The Hive, lalu ketik */reprocess* di grup ini ya kak! 😊`
        );

        for (const jid of targetJids) {
            try {
                await this.sender.sendMessage(jid, {
                    type: "text",
                    text: alertText,
                    contextInfo: {
                        mentionedJids: [adminJid],
                        mentionedJid: [adminJid]
                    }
                });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[AdminGroupLogger] Error sending token alert to group ${jid}:`, msg);
            }
        }
    }
}
