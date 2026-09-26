import type { OrderStatus } from "../types";
import { config } from "../config";

export interface GroupMessageSender {
    sendMessage(jid: string, content: string | { type: string; text: string; contextInfo?: any }): Promise<any>;
    editMessage(jid: string, key: any, newText: string): Promise<any>;
    getGroupParticipants?: (jid: string) => Promise<string[]>;
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

    private formatBuyerContact(platformUserId: string): string {
        if (!platformUserId) return "";
        if (platformUserId.endsWith("@g.us")) {
            return `👥 Chat Grup: ${platformUserId.split("@")[0]}`;
        }
        if (platformUserId.endsWith("@lid")) {
            const lidNum = platformUserId.split("@")[0]?.replace(/[^0-9]/g, "");
            return `📱 Akun: WhatsApp User (ID Privasi: ${lidNum})\n💡 _(Nomor disembunyikan oleh WhatsApp Privacy / Multi-Device. Buka chat langsung di HP bot)_`;
        }
        const cleanDigits = platformUserId.replace(/[^0-9]/g, "");
        if (cleanDigits.length >= 10 && cleanDigits.length <= 14) {
            return `📱 Pembeli: wa.me/${cleanDigits} (+${cleanDigits})`;
        }
        return `📱 Pembeli: wa.me/${cleanDigits}`;
    }

    private formatLogMessage(entry: OrderLogEntry): string {
        const statusBadge = this.formatStatusBadge(entry.status, entry.failureReason);
        const buyerContact = this.formatBuyerContact(entry.platformUserId);

        let out = `📦 *ORDER BARU — ${config.STORE_NAME.toUpperCase()}*\n\n`;
        out += `🆔 ID: *#${entry.orderId}*\n`;
        out += `🛍️ Item: *${entry.itemName}*\n`;
        out += `👤 Gamertag: *${entry.gamertag}*\n`;
        out += `💰 Total: *Rp ${entry.totalNominal.toLocaleString("id-ID")}*\n`;
        if (buyerContact) {
            out += `${buyerContact}\n`;
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
    }): Promise<void> {
        const targetJids = new Set<string>();
        if (this.adminGroupJid) targetJids.add(this.adminGroupJid);
        if (this.logGroupJid) targetJids.add(this.logGroupJid);
        if (targetJids.size === 0) return;

        const alertText = (
            `⚠️ *PERHATIAN ADMIN — RESTOCK TOKEN DIBUTUHKAN!*\n\n` +
            `Pesanan *#${order.orderId}* (*${order.itemName}* untuk Gamertag *${order.gamertag}*) tertahan karena stok token Gibot kurang.\n\n` +
            `👉 Silakan restock token The Hive, lalu ketik */reprocess* di grup ini ya kak! 😊`
        );

        for (const jid of targetJids) {
            try {
                await this.sender.sendMessage(jid, {
                    type: "text",
                    text: alertText
                });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[AdminGroupLogger] Error sending token alert to group ${jid}:`, msg);
            }
        }
    }

    async notifySupportRequest(info: {
        orderId?: string;
        itemName?: string;
        gamertag?: string;
        platformUserId: string;
        reason?: string;
        attempts?: number;
    }): Promise<void> {
        const targetJid = this.adminGroupJid || this.logGroupJid;
        if (!targetJid) return;

        const cleanPhone = info.platformUserId.replace(/[^0-9]/g, "");
        const reasonText = info.reason || (info.attempts ? `Gamertag tidak ditemukan di The Hive setelah ${info.attempts}x percobaan` : "Pembeli meminta bantuan manual admin");

        let alertText = `🚨 *PERMINTAAN BANTUAN PELANGGAN — SUPPORT TICKET* 🚨\n`;
        alertText += `@everyone\n\n`;
        alertText += `Ada pembeli yang memerlukan bantuan manual admin:\n`;
        if (cleanPhone) alertText += `📱 WhatsApp: wa.me/${cleanPhone} (+${cleanPhone})\n`;
        if (info.orderId) alertText += `🆔 Order ID: *#${info.orderId}*\n`;
        if (info.itemName) alertText += `🛍️ Item: *${info.itemName}*\n`;
        if (info.gamertag) alertText += `🎮 Gamertag: *${info.gamertag}*\n`;
        alertText += `⚠️ Kendala: *${reasonText}*\n\n`;
        alertText += `👉 *INSTRUKSI ADMIN:*\n`;
        alertText += `• Mode *Live Chat* saat ini AKTIF untuk pelanggan ini (perintah otomatis bot dinonaktifkan).\n`;
        alertText += `• Silakan buka WhatsApp di HP Anda dan balas chat pelanggan secara langsung.\n\n`;
        alertText += `💡 *Setelah selesai membantu pelanggan, ketik perintah berikut di grup ini:*\n`;
        alertText += `👉 */solved ${info.orderId || cleanPhone}* (untuk mengaktifkan bot kembali)`;

        try {
            let participantJids: string[] = [];
            if (this.sender.getGroupParticipants) {
                try {
                    participantJids = await this.sender.getGroupParticipants(targetJid);
                } catch (err: unknown) {
                    console.warn(`[AdminGroupLogger] Could not fetch group participants for mentions:`, err);
                }
            }

            if (participantJids.length > 0) {
                await this.sender.sendMessage(targetJid, {
                    type: "text",
                    text: alertText,
                    contextInfo: {
                        mentionedJids: participantJids
                    }
                });
            } else {
                await this.sender.sendMessage(targetJid, alertText);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[AdminGroupLogger] Error sending support alert to ${targetJid}:`, msg);
        }
    }
}
