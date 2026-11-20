import type { OrderStatus } from "../types";
import { formatStatusBadge, t } from "../i18n";
import { extractPhoneNumber } from "../utils/messageUtils";
import {
    buildAdminOrderActionButtons,
    buildAdminOrderFailureButtons,
    buildAdminSupportSolvedButtons
} from "../utils/interactiveBuilders";


export interface GroupMessageSender {
    sendMessage(jid: string, content: any, options?: any): Promise<any>;
    editMessage(jid: string, key: any, newText: string): Promise<any>;
    getGroupParticipants?: (jid: string) => Promise<string[]>;
    getGroupMetadata?: (jid: string) => Promise<any>;
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
    private readonly adminIdentities = new Set<string>();

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

    addAdminUser(identity: string): void {
        if (!identity) return;
        const trimmed = identity.trim();
        this.adminIdentities.add(trimmed.toLowerCase());
        const userPart = trimmed.split("@")[0]?.split(":")[0];
        if (userPart) {
            this.adminIdentities.add(userPart.toLowerCase());
        }
        const cleanDigits = extractPhoneNumber(trimmed);
        if (cleanDigits) {
            this.adminIdentities.add(cleanDigits);
        }
    }

    addAdminParticipants(participants: Array<string | { jid: string; lid?: string; phoneNumber?: string }>): void {
        for (const p of participants) {
            if (typeof p === "string") {
                this.addAdminUser(p);
            } else if (p && typeof p === "object") {
                if (p.jid) this.addAdminUser(p.jid);
                if (p.lid) this.addAdminUser(p.lid);
                if (p.phoneNumber) this.addAdminUser(p.phoneNumber);
            }
        }
    }

    isAdminUser(jidOrPhone: string): boolean {
        if (!jidOrPhone) return false;
        const trimmed = jidOrPhone.trim().toLowerCase();
        if (this.adminIdentities.has(trimmed)) {
            return true;
        }
        const userPart = trimmed.split("@")[0]?.split(":")[0];
        if (userPart && this.adminIdentities.has(userPart)) {
            return true;
        }
        const cleanDigits = extractPhoneNumber(trimmed);
        if (cleanDigits && this.adminIdentities.has(cleanDigits)) {
            return true;
        }
        return false;
    }

    getAllAdminIdentities(): string[] {
        return Array.from(this.adminIdentities);
    }

    async syncAdminParticipants(groupJid?: string): Promise<void> {
        const target = groupJid || this.adminGroupJid;
        if (!target) return;
        try {
            if (this.sender.getGroupMetadata) {
                const meta = await this.sender.getGroupMetadata(target);
                if (meta?.participants) {
                    this.addAdminParticipants(meta.participants);
                }
            } else if (this.sender.getGroupParticipants) {
                const list = await this.sender.getGroupParticipants(target);
                this.addAdminParticipants(list);
            }
        } catch (err: unknown) {
            console.warn(`[AdminGroupLogger] Could not sync admin participants for ${target}:`, err);
        }
    }

    setLogGroupJid(jid: string): void {
        this.logGroupJid = jid;
    }

    getLogGroupJid(): string {
        return this.logGroupJid;
    }

    setAdminGroupJid(jid: string): void {
        this.adminGroupJid = jid;
        this.syncAdminParticipants(jid).catch(() => {});
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
        return formatStatusBadge(status, "id", failureReason);
    }

    private formatBuyerContact(platformUserId: string): string {
        if (!platformUserId) return "";
        if (platformUserId.endsWith("@g.us")) {
            return t("adminLog.contactGroup", "id", { groupId: platformUserId.split("@")[0] || "" });
        }
        if (platformUserId.endsWith("@lid")) {
            const lidNum = platformUserId.split("@")[0]?.replace(/[^0-9]/g, "") || "";
            return t("adminLog.contactLid", "id", { lidNum });
        }
        const cleanDigits = platformUserId.replace(/[^0-9]/g, "");
        if (cleanDigits.length >= 10 && cleanDigits.length <= 14) {
            return t("adminLog.contactPhoneWithPlus", "id", { digits: cleanDigits });
        }
        return t("adminLog.contactPhone", "id", { digits: cleanDigits });
    }

    private formatLogMessage(entry: OrderLogEntry): string {
        const statusBadge = this.formatStatusBadge(entry.status, entry.failureReason);
        const buyerContact = this.formatBuyerContact(entry.platformUserId);

        let out = t("adminLog.newOrderHeader", "id");
        out += t("adminLog.fieldOrderId", "id", { orderId: entry.orderId });
        out += t("adminLog.fieldItem", "id", { itemName: entry.itemName });
        out += t("adminLog.fieldGamertag", "id", { gamertag: entry.gamertag });
        out += t("adminLog.fieldTotal", "id", { totalFormatted: entry.totalNominal.toLocaleString("id-ID") });
        if (buyerContact) {
            out += `${buyerContact}\n`;
        }
        out += t("adminLog.fieldStatus", "id", { statusBadge });

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

            // Follow-up: send action buttons (Paid & Done) quoting the original order log message
            if (messageKey) {
                try {
                    const buttonPayload = buildAdminOrderActionButtons(order.orderId, "id");
                    await this.sender.sendMessage(this.logGroupJid, buttonPayload, { quote: messageKey });
                } catch (btnErr) {
                    console.warn(`[AdminGroupLogger] Failed to send follow-up action buttons for #${order.orderId}:`, btnErr);
                }
            }
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
            let updateMsg = t("adminLog.updateStatusHeader", "id");
            updateMsg += t("adminLog.fieldOrderId", "id", { orderId });
            if (extra?.itemName) updateMsg += t("adminLog.fieldItem", "id", { itemName: extra.itemName });
            if (extra?.gamertag) updateMsg += t("adminLog.fieldGamertag", "id", { gamertag: extra.gamertag });
            if (extra?.platformUserId) {
                const cleanPhone = extra.platformUserId.replace(/[^0-9]/g, "");
                if (cleanPhone) updateMsg += `${t("adminLog.contactPhone", "id", { digits: cleanPhone })}\n`;
            }
            updateMsg += t("adminLog.fieldStatus", "id", { statusBadge });

            try {
                const sent = await this.sender.sendMessage(this.logGroupJid, updateMsg);
                const messageKey =
                    sent?.key ??
                    (sent?.id ? { id: sent.id, remoteJid: this.logGroupJid, fromMe: true } : undefined);

                const isFailedOrHeld =
                    status === "FAILED" ||
                    status === "INSUFFICIENT_TOKENS";

                if (isFailedOrHeld && messageKey) {
                    try {
                        const failPayload = buildAdminOrderFailureButtons(orderId, extra?.failureReason, "id");
                        await this.sender.sendMessage(this.logGroupJid, failPayload, { quote: messageKey });
                    } catch (failErr) {
                        console.warn(`[AdminGroupLogger] Failed to send fallback failure retry buttons for #${orderId}:`, failErr);
                    }
                }
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

        let editSucceeded = false;
        if (entry.messageKey) {
            try {
                await this.sender.editMessage(this.logGroupJid, entry.messageKey, updatedText);
                editSucceeded = true;
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[AdminGroupLogger] Edit failed for order #${orderId}, falling back to new message:`, msg);
            }
        }

        if (!editSucceeded) {
            // Fallback: send as new message if no messageKey or if editMessage failed
            try {
                const sent = await this.sender.sendMessage(this.logGroupJid, updatedText);
                const newKey =
                    sent?.key ??
                    (sent?.id ? { id: sent.id, remoteJid: this.logGroupJid, fromMe: true } : undefined);
                if (newKey) {
                    entry.messageKey = newKey;
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[AdminGroupLogger] Error sending fallback log for order #${orderId}:`, msg);
            }
        }

        // If order failed or held: send follow-up message quoting the order log with retry button
        const isFailedOrHeld =
            status === "FAILED" ||
            status === "INSUFFICIENT_TOKENS";

        if (isFailedOrHeld && entry.messageKey) {
            try {
                const failPayload = buildAdminOrderFailureButtons(orderId, extra?.failureReason, "id");
                await this.sender.sendMessage(this.logGroupJid, failPayload, { quote: entry.messageKey });
            } catch (failErr) {
                console.warn(`[AdminGroupLogger] Failed to send failure retry buttons for #${orderId}:`, failErr);
            }
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

        const alertText = t("adminLog.insufficientTokensAlert", "id", {
            orderId: order.orderId,
            itemName: order.itemName,
            gamertag: order.gamertag
        });

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

    async notifyDelayedPayment(order: {
        orderId: string;
        itemName: string;
        gamertag: string;
        failureReason?: string;
    }): Promise<void> {
        const targetJids = new Set<string>();
        if (this.adminGroupJid) targetJids.add(this.adminGroupJid);
        if (this.logGroupJid) targetJids.add(this.logGroupJid);
        if (targetJids.size === 0) return;

        const alertText = t("adminLog.delayedPaymentAlert", "id", {
            orderId: order.orderId,
            itemName: order.itemName,
            gamertag: order.gamertag
        });

        for (const jid of targetJids) {
            try {
                await this.sender.sendMessage(jid, alertText);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`[AdminGroupLogger] Error sending delayed payment alert to group ${jid}:`, msg);
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
        const reasonText = info.reason || (
            info.attempts
                ? t("adminLog.supportDefaultReasonAttempts", "id", { attempts: info.attempts })
                : t("adminLog.supportDefaultReasonManual", "id")
        );

        let alertText = t("adminLog.supportTicketAlert", "id");
        if (cleanPhone) alertText += t("adminLog.supportFieldWhatsapp", "id", { phone: cleanPhone });
        if (info.orderId) alertText += t("adminLog.fieldOrderId", "id", { orderId: info.orderId });
        if (info.itemName) alertText += t("adminLog.fieldItem", "id", { itemName: info.itemName });
        if (info.gamertag) alertText += t("adminLog.supportFieldGamertag", "id", { gamertag: info.gamertag });
        alertText += t("adminLog.supportFieldReason", "id", { reason: reasonText });
        alertText += t("adminLog.supportInstructions", "id");

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

            const solvedPayload = buildAdminSupportSolvedButtons(info.platformUserId, "id");
            await this.sender.sendMessage(targetJid, solvedPayload);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[AdminGroupLogger] Error sending support alert to ${targetJid}:`, msg);
        }
    }
}
