import type { CoreClient } from "../coreClient";
import type { StateManager } from "../state";
import type { CatalogItem } from "../types";
import type { AdminGroupLogger } from "./adminLogger";
import { formatStatusBadge, formatRupiah, t, type Language } from "../i18n";
import { config } from "../config";
import {
    CATEGORIES,
    type CategoryDefinition,
    resolveCategory,
    currentStoreDiscount,
    getKnownStoreDiscount,
    setKnownStoreDiscount
} from "../utils/categories";
import {
    formatStatusText,
    renderMainMenu,
    renderOrderCategoryMenu,
    renderCategoryItems,
    sendCategoryOrderPoster
} from "../utils/formatters";
import {
    extractMessageText,
    isPrivateChat,
    extractEventTimestampSeconds,
    isEventStale,
    extractPhoneNumber,
    isUserAdmin,
    executeUserSequential,
    sendUnrecognizedCommand,
    GREETINGS
} from "../utils/messageUtils";
import { defaultRegistry } from "../commands";
import { isLiveChatActive, isAwaitingSupportConfirmation, handleSupportConfirmation } from "../flows/supportFlow";
import { handleBuyingFlow } from "../flows/buyingFlow";
import statusCommand from "../commands/general/status";

// Re-exports for backward compatibility
export {
    formatStatusBadge,
    formatRupiah,
    CATEGORIES,
    type CategoryDefinition,
    resolveCategory,
    currentStoreDiscount,
    getKnownStoreDiscount,
    setKnownStoreDiscount,
    formatStatusText,
    renderMainMenu,
    renderOrderCategoryMenu,
    renderCategoryItems,
    sendCategoryOrderPoster,
    extractMessageText,
    isPrivateChat,
    extractEventTimestampSeconds,
    isEventStale,
    extractPhoneNumber,
    isUserAdmin,
    executeUserSequential,
    sendUnrecognizedCommand
};

export { catalogCommand as handleKatalogCommand } from "../commands/general/catalog";

export interface BotContext {
    client: CoreClient;
    state: StateManager;
    adminLogger?: AdminGroupLogger;
    qrDeleter?: (jid: string, key?: any) => Promise<void>;
    sendText(jid: string, text: string, mentions?: string[]): Promise<void>;
    sendImage(jid: string, buffer: Buffer, caption?: string): Promise<any>;
    sendPoll?(jid: string, title: string, options: string[]): Promise<void>;
}

export async function handleIncomingMessage(
    remoteJidOrEvent: string | unknown,
    fromMeOrCtx: boolean | BotContext,
    bodyText?: string,
    ctx?: BotContext,
    participant?: string,
    timestampSeconds?: number
): Promise<void> {
    let remoteJid: string | undefined;
    let fromMe = false;
    let text = "";
    let context: BotContext;
    let part = participant;

    if (typeof remoteJidOrEvent === "string") {
        remoteJid = remoteJidOrEvent;
        fromMe = Boolean(fromMeOrCtx);
        text = bodyText || "";
        context = ctx!;
        part = participant;
    } else {
        const staleCheck = isEventStale(remoteJidOrEvent);
        if (staleCheck.stale) return;

        const ev = remoteJidOrEvent as Record<string, any>;
        remoteJid = ev?.key?.remoteJid;
        fromMe = Boolean(ev?.key?.fromMe);
        part = ev?.key?.participant || ev?.participant;
        text = extractMessageText(ev?.message) || "";
        context = fromMeOrCtx as BotContext;
    }

    if (!remoteJid || !context) return;
    if (!text || !text.trim()) return;

    const userKey = remoteJid.endsWith("@g.us")
        ? `${remoteJid}:${part || remoteJid}`
        : remoteJid;

    await executeUserSequential(userKey, () =>
        handleIncomingMessageInternal(remoteJid!, fromMe, text, context, part)
    );
}

async function handleIncomingMessageInternal(
    remoteJid: string,
    fromMe: boolean,
    bodyText: string,
    ctx: BotContext,
    participant?: string
): Promise<void> {
    const isGroup = remoteJid.endsWith("@g.us");
    if (!isPrivateChat(remoteJid) && !isGroup) {
        return;
    }

    const trimmed = bodyText.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();

    // Determine sender identity and language preference
    const effectiveSender = isGroup ? (participant || remoteJid) : remoteJid;
    const userLang = ctx.state.getLanguage(effectiveSender);
    const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminLogger);

    // 1. Group Chat Routing
    if (isGroup) {
        if (!trimmed.startsWith("/")) {
            return;
        }

        const parts = trimmed.split(/\s+/);
        const cmd = parts[0]?.toLowerCase() || "";
        const args = parts.slice(1);

        const handled = await defaultRegistry.dispatch(cmd, {
            remoteJid,
            sender: effectiveSender,
            args,
            rawText: trimmed,
            isGroup: true,
            isAdmin,
            userLang,
            ctx
        });

        if (!handled) {
            await sendUnrecognizedCommand(remoteJid, cmd, userLang, ctx, effectiveSender);
        }
        return;
    }

    // 2. Private 1:1 Chat Routing
    // Live chat active: bot is paused so admin can chat directly with customer via WhatsApp web/app
    if (isLiveChatActive(remoteJid, ctx)) {
        // Only allow /solved command from admin to end the session
        if (lower === "/solved" || lower.startsWith("/solved ") || lower === "/solve" || lower.startsWith("/solve ")) {
            if (isAdmin) {
                const parts = trimmed.split(/\s+/);
                await defaultRegistry.dispatch(parts[0].toLowerCase(), {
                    remoteJid,
                    sender: effectiveSender,
                    args: parts.slice(1),
                    rawText: trimmed,
                    isGroup: false,
                    isAdmin,
                    userLang,
                    ctx
                });
            }
        }
        return;
    }

    // Awaiting support confirmation prompt
    if (isAwaitingSupportConfirmation(remoteJid, ctx)) {
        await handleSupportConfirmation(remoteJid, trimmed, ctx, userLang, effectiveSender);
        return;
    }

    // Prevent bot self-reply loops
    if (fromMe) {
        if (
            trimmed.startsWith("Waduh,") ||
            trimmed.startsWith("Halo kak!") ||
            trimmed.startsWith("🛒") ||
            trimmed.startsWith("🧾") ||
            trimmed.startsWith("💡") ||
            trimmed.startsWith("❌") ||
            trimmed.startsWith("✅") ||
            trimmed.startsWith("⚠️") ||
            trimmed.startsWith("ℹ️") ||
            trimmed.startsWith("⏱️") ||
            trimmed.startsWith("🏷️") ||
            trimmed.startsWith("🎉") ||
            trimmed.startsWith("✨") ||
            trimmed.startsWith("Silakan balas") ||
            trimmed.includes("Waduh, pilihan itemnya belum sesuai")
        ) {
            return;
        }
    }

    // Slash command execution (checked BEFORE buying flow so commands always take precedence)
    if (trimmed.startsWith("/")) {
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0]?.toLowerCase() || "";
        const args = parts.slice(1);

        const handled = await defaultRegistry.dispatch(cmd, {
            remoteJid,
            sender: effectiveSender,
            args,
            rawText: trimmed,
            isGroup: false,
            isAdmin,
            userLang,
            ctx
        });

        if (!handled) {
            await sendUnrecognizedCommand(remoteJid, cmd, userLang, ctx);
        }
        return;
    }

    // Interactive buying wizard flow (or idle category direct selection)
    const handledByFlow = await handleBuyingFlow(
        remoteJid,
        fromMe,
        trimmed,
        ctx,
        userLang,
        effectiveSender
    );
    if (handledByFlow) {
        return;
    }

    // Bare order ID inquiry (e.g. user sends "ORD-ABC123" or "#ORD-ABC123")
    const orderMatch = trimmed.match(/^#?(ORD-[A-Z0-9]{4,10})$/i);
    if (orderMatch && orderMatch[1]) {
        await statusCommand.execute({
            remoteJid,
            sender: effectiveSender,
            args: [orderMatch[1].toUpperCase()],
            rawText: trimmed,
            isGroup: false,
            isAdmin,
            userLang,
            ctx
        });
        return;
    }

    // Natural greeting check (e.g. "halo", "hai", "p")
    if (GREETINGS.includes(lower)) {
        await ctx.sendText(remoteJid, t("greeting", userLang));
        return;
    }

    // Fallback unrecognized response
    await sendUnrecognizedCommand(remoteJid, trimmed, userLang, ctx);
}
