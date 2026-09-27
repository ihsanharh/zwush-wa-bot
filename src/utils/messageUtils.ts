import { t, type Language } from "../i18n";
import type { AdminGroupLogger } from "../handlers/adminLogger";
import type { BotContext } from "../handlers/message";

export const GREETINGS = [
    "halo", "halo kak", "halo min", "hai", "hai kak", "hi", "hi kak", "hey",
    "p", "tes", "test", "assalamualaikum", "assalamu'alaikum",
    "selamat pagi", "pagi", "selamat siang", "siang", "selamat sore", "sore", "selamat malam", "malam"
];

/**
 * Extracts raw textual payload from various message envelope forms.
 */
export function extractMessageText(message: unknown): string {
    if (!message || typeof message !== "object") return "";

    const msgObj = message as Record<string, unknown>;

    // Unwrap envelope wrappers if message is ephemeral, view-once, or document
    const innerMsg =
        (msgObj.ephemeralMessage as Record<string, unknown> | undefined)?.message ??
        (msgObj.viewOnceMessage as Record<string, unknown> | undefined)?.message ??
        (msgObj.viewOnceMessageV2 as Record<string, unknown> | undefined)?.message ??
        (msgObj.documentWithCaptionMessage as Record<string, unknown> | undefined)?.message ??
        msgObj;

    if (!innerMsg || typeof innerMsg !== "object") return "";
    const innerObj = innerMsg as Record<string, unknown>;

    if (typeof innerObj.conversation === "string") {
        return innerObj.conversation;
    }

    const extended = innerObj.extendedTextMessage as Record<string, unknown> | undefined;
    if (typeof extended?.text === "string") {
        return extended.text;
    }

    const image = innerObj.imageMessage as Record<string, unknown> | undefined;
    if (typeof image?.caption === "string") {
        return image.caption;
    }

    const video = innerObj.videoMessage as Record<string, unknown> | undefined;
    if (typeof video?.caption === "string") {
        return video.caption;
    }

    return "";
}

/**
 * Checks if the JID belongs to a 1:1 private chat (@s.whatsapp.net or @lid).
 * Strictly filters out groups (@g.us), status broadcasts, and newsletters.
 */
export function isPrivateChat(remoteJid: string): boolean {
    if (!remoteJid) return false;
    if (
        remoteJid.endsWith("@g.us") ||
        remoteJid.includes("@broadcast") ||
        remoteJid.includes("@newsletter")
    ) {
        return false;
    }
    return remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
}

/**
 * Safely extracts timestamp in seconds from a WhatsApp incoming message/addon event.
 */
export function extractEventTimestampSeconds(event: unknown): number | null {
    if (!event || typeof event !== "object") return null;
    const ev = event as Record<string, any>;

    const raw =
        ev.timestampSeconds ??
        ev.rawNode?.attrs?.t ??
        ev.messageTimestamp ??
        ev.timestamp ??
        ev.message?.messageTimestamp ??
        ev.raw?.messageTimestamp;

    if (raw == null) return null;
    let ts = typeof raw === "object" && raw?.low != null ? raw.low : Number(raw);
    if (isNaN(ts) || ts <= 0) return null;
    if (ts > 1e11) ts = Math.floor(ts / 1000);
    return ts;
}

/**
 * Checks whether an incoming message/addon event is stale (> maxAgeSec old, default 300s = 5 minutes).
 */
export function isEventStale(event: unknown, maxAgeSec: number = 300): { stale: boolean; ageSec?: number; reason?: string } {
    const tsSec = extractEventTimestampSeconds(event);
    if (tsSec !== null) {
        const nowSec = Math.floor(Date.now() / 1000);
        const ageSec = nowSec - tsSec;
        if (ageSec > maxAgeSec) {
            return { stale: true, ageSec, reason: `Timestamp is ${ageSec}s old (limit: ${maxAgeSec}s)` };
        }
        return { stale: false, ageSec };
    }

    if (Boolean((event as any)?.offline)) {
        return { stale: true, reason: "Offline catch-up stanza with missing timestamp" };
    }

    return { stale: false };
}

/**
 * Normalizes WhatsApp JIDs and phone numbers:
 * - Strips domain (@s.whatsapp.net, @lid, @g.us)
 * - Strips multi-device suffix (:0, :1, :2)
 * - Normalizes Indonesian 08... to 628...
 */
export function extractPhoneNumber(jidOrPhone: string): string {
    if (!jidOrPhone) return "";
    const userPart = jidOrPhone.split("@")[0] || "";
    const phonePart = userPart.split(":")[0] || "";
    let digits = phonePart.replace(/[^0-9]/g, "");
    if (digits.startsWith("0")) {
        digits = "62" + digits.slice(1);
    } else if (digits.startsWith("8") && digits.length >= 9 && digits.length <= 13) {
        digits = "62" + digits;
    }
    return digits;
}

/**
 * Checks if the message sender is an authorized administrator.
 */
export function isUserAdmin(
    remoteJid: string,
    fromMe: boolean,
    effectiveSender?: string,
    adminLogger?: AdminGroupLogger
): boolean {
    if (fromMe) return true;

    // Anyone inside the Admin Command Group is authorized ("superpower")
    if (adminLogger) {
        if (adminLogger.getAdminGroupJid && adminLogger.getAdminGroupJid() && remoteJid === adminLogger.getAdminGroupJid()) {
            return true;
        }
        // Fallback for mocks where only getGroupJid is implemented
        if (!adminLogger.getAdminGroupJid && adminLogger.getGroupJid && remoteJid === adminLogger.getGroupJid()) {
            return true;
        }
    }

    return false;
}

export async function sendUnrecognizedCommand(
    remoteJid: string,
    cmd: string,
    userLang: Language,
    ctx: BotContext,
    mentionSender?: string
): Promise<void> {
    const senderPhone = mentionSender ? extractPhoneNumber(mentionSender) : "";
    const prefix = mentionSender ? `@${senderPhone}\n\n` : "";
    const mentions = mentionSender ? [mentionSender] : undefined;

    const body = t("unrecognizedCommand", userLang, { command: cmd });
    await ctx.sendText(remoteJid, `${prefix}${body}`, mentions);
}

const userMessageQueues = new Map<string, Promise<void>>();

export function executeUserSequential(userKey: string, task: () => Promise<void>): Promise<void> {
    const lastTask = userMessageQueues.get(userKey) || Promise.resolve();
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<void>((_, reject) => {
        timerId = setTimeout(() => reject(new Error("User queue task timed out (90s)")), 90000);
    });

    const runWithTimeout = async () => {
        try {
            await Promise.race([task(), timeoutPromise]);
        } finally {
            if (timerId !== undefined) {
                clearTimeout(timerId);
            }
        }
    };

    const currentTask = lastTask
        .then(runWithTimeout)
        .catch((err) => {
            console.error(`[Message Queue Error for ${userKey}]:`, err);
        })
        .finally(() => {
            if (userMessageQueues.get(userKey) === currentTask) {
                userMessageQueues.delete(userKey);
            }
        });

    userMessageQueues.set(userKey, currentTask);
    return currentTask;
}
