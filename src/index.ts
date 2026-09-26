import { ConsoleLogger, createStore, WaClient } from "zapo-js";
import { createSqliteStore } from "@zapo-js/store-sqlite";
import qrcodeTerminal from "qrcode-terminal";
import { config } from "./config";
import { CoreClient } from "./coreClient";
import { StateManager } from "./state";
import { createWebhookApp, type BotMessageSender } from "./handlers/webhook";
import {
    handleIncomingMessage,
    extractMessageText,
    extractEventTimestampSeconds,
    isEventStale,
    type BotContext
} from "./handlers/message";
import { AdminGroupLogger } from "./handlers/adminLogger";

console.log(`⚡ Starting ${config.STORE_NAME} WhatsApp Bot...`);

// 1. Initialize SQLite Session Store for zapo-js
const store = createStore({
    backends: {
        sqlite: createSqliteStore({ path: "./.auth/state.sqlite" })
    },
    providers: {
        auth: "sqlite",
        signal: "sqlite",
        preKey: "sqlite",
        session: "sqlite",
        identity: "sqlite",
        senderKey: "sqlite",
        appState: "sqlite",
        privacyToken: "sqlite",
        messages: "sqlite",
        threads: "sqlite",
        contacts: "sqlite"
    }
});

const client = new WaClient({ store, sessionId: "default" }, new ConsoleLogger("info"));
const coreClient = new CoreClient(config.CORE_API_URL);
const stateManager = new StateManager();

const adminLogger = new AdminGroupLogger(
    {
        logGroupJid: config.LOG_GROUP_JID || "",
        adminGroupJid: config.ADMIN_GROUP_JID || ""
    },
    {
        async sendMessage(jid: string, content: any) {
            return await client.message.send(jid, content);
        },
        async editMessage(jid: string, key: any, newText: string) {
            const editKey = key?.id ? key : { id: key, remoteJid: jid, fromMe: true };
            console.log(`[Admin Logger] Editing message in ${jid} (id: ${editKey.id})`);
            return await client.message.send(jid, newText, { editKey });
        },
        async getGroupParticipants(jid: string) {
            try {
                const meta = await client.group.queryGroupMetadata(jid);
                return meta.participants.map((p) => p.jid);
            } catch (err: unknown) {
                console.warn(`[Admin Logger] Failed to fetch participants for ${jid}:`, err);
                return [];
            }
        }
    }
);

// 2. Setup message context for handlers
const botContext: BotContext = {
    client: coreClient,
    state: stateManager,
    adminLogger,
    async sendText(jid: string, text: string, mentions?: string[]) {
        console.log(`[WhatsApp Sending Text to ${jid}]:\n${text.slice(0, 100)}...`);
        if (mentions && mentions.length > 0) {
            await client.message.send(jid, {
                type: "text",
                text,
                contextInfo: {
                    mentionedJids: mentions
                }
            });
        } else {
            await client.message.send(jid, text);
        }
    },
    async sendImage(jid: string, buffer: Buffer, caption: string = "") {
        console.log(`[WhatsApp Sending Image to ${jid}]:\n${caption ? caption.slice(0, 100) + "..." : "(no caption)"}`);
        return await client.message.send(jid, {
            type: "image",
            media: buffer,
            mimetype: "image/png",
            ...(caption ? { caption } : {})
        });
    },
    async sendPoll(jid: string, title: string, options: string[]) {
        console.log(`[WhatsApp Sending Poll to ${jid}]: ${title}`);
        await client.message.send(jid, {
            type: "poll",
            name: title,
            options,
            selectableCount: 1
        });
    }
};

// 3. Terminal QR Code Event
client.on("auth_qr", ({ qr }) => {
    console.log("\n=========================================");
    console.log("📱 Scan this QR code with WhatsApp on your phone:");
    console.log("=========================================\n");
    qrcodeTerminal.generate(qr, { small: true });
});

async function discoverGroups() {
    try {
        console.log(`[Groups] Searching for "${config.LOG_GROUP_NAME}" and "${config.ADMIN_GROUP_NAME}"...`);
        const groups = await client.group.queryAllGroups();

        if (!adminLogger.getLogGroupJid()) {
            const target = groups.find(
                (g) => g.subject.trim().toLowerCase() === config.LOG_GROUP_NAME.trim().toLowerCase()
            );
            if (target) {
                adminLogger.setLogGroupJid(target.jid);
                console.log(`[Groups] Auto-discovered Transaction Log Group "${target.subject}" (${target.jid})`);
            } else {
                console.log(`[Groups] Log Group "${config.LOG_GROUP_NAME}" not found. Run /setgroup log in the group.`);
            }
        } else {
            console.log(`[Groups] Log Group already configured: ${adminLogger.getLogGroupJid()}`);
        }

        if (!adminLogger.getAdminGroupJid()) {
            const target = groups.find(
                (g) => g.subject.trim().toLowerCase() === config.ADMIN_GROUP_NAME.trim().toLowerCase()
            );
            if (target) {
                adminLogger.setAdminGroupJid(target.jid);
                console.log(`[Groups] Auto-discovered Admin Command Group "${target.subject}" (${target.jid})`);
            } else {
                console.log(`[Groups] Admin Group "${config.ADMIN_GROUP_NAME}" not found. Run /setgroup admin in the group.`);
            }
        } else {
            console.log(`[Groups] Admin Group already configured: ${adminLogger.getAdminGroupJid()}`);
        }
    } catch (err: unknown) {
        console.error("[Groups] Failed to auto-discover groups:", err);
    }
}

// 4. Paired Authentication Event
client.on("auth_paired", async ({ credentials }) => {
    console.log(`✅ Successfully paired as: ${credentials.meJid}`);
    await discoverGroups();
});

// 5. Incoming Addon Dispatcher (Poll Votes, Reactions)
client.on("message_addon", async (event) => {
    try {
        const staleCheck = isEventStale(event, 300);
        if (staleCheck.stale) {
            console.log(`[Addon Ignored] Stale addon (${staleCheck.reason}) from ${event.key?.remoteJid}`);
            return;
        }

        if (event.kind === "poll_vote" && event.decrypted) {
            const pollData = event.decrypted as { selectedOptionNames?: readonly string[] | null };
            const selected = pollData.selectedOptionNames?.[0];
            const remoteJid = event.key?.remoteJid || "";
            const fromMe = Boolean(event.key?.fromMe);
            const participant = event.key?.participant ?? undefined;
            const tsSec = extractEventTimestampSeconds(event) ?? undefined;

            if (selected) {
                console.log(`[Poll Vote Event] from: ${remoteJid}, selected: "${selected}"`);
                await handleIncomingMessage(remoteJid, fromMe, selected, botContext, participant, tsSec);
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Addon Event Error]:", msg);
    }
});

// 6. Incoming Message Dispatcher
client.on("message", async (event) => {
    try {
        const remoteJid = event.key?.remoteJid || "";
        const fromMe = Boolean(event.key?.fromMe);
        const participant = event.key?.participant ?? undefined;
        const text = extractMessageText(event.message);

        const staleCheck = isEventStale(event, 300);
        if (staleCheck.stale) {
            console.log(`[Message Ignored] Stale message (${staleCheck.reason}) from ${remoteJid}: "${text.slice(0, 30)}"`);
            return;
        }

        const tsSec = extractEventTimestampSeconds(event) ?? undefined;
        console.log(`[WhatsApp Message Event] from: ${remoteJid}, participant: ${participant}, fromMe: ${fromMe}, text: "${text}"`);

        await handleIncomingMessage(remoteJid, fromMe, text, botContext, participant, tsSec);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Message Event Error]:", msg);
    }
});

// 7. Start Webhook Server (Port 3001)
const webhookSender: BotMessageSender = {
    async sendMessage(jid: string, text: string) {
        await client.message.send(jid, text);
    }
};

async function qrDeleter(jid: string, key?: any) {
    const qrKey = key ?? stateManager.getQrMessageKey(jid);
    if (qrKey) {
        try {
            console.log(`[WhatsApp Deleting QR Message for ${jid}]`);
            const target = qrKey?.id ? qrKey : { id: qrKey, remoteJid: jid, fromMe: true };
            await client.message.send(jid, { type: "revoke", target });
            stateManager.clearQrMessageKey(jid);
        } catch (err: unknown) {
            console.error(`[QR Deleter Error] Failed to delete QR for ${jid}:`, err);
        }
    }
}

const webhookApp = createWebhookApp({
    sender: webhookSender,
    adminLogger,
    qrDeleter,
    getBuyerLanguage: (jid: string) => stateManager.getLanguage(jid),
    stateManager
});

Bun.serve({
    fetch: webhookApp.fetch,
    port: config.PORT,
    hostname: "0.0.0.0"
});
console.log(`🚀 Webhook server listening on http://0.0.0.0:${config.PORT}/webhook/order-update`);

// 8. Connect to WhatsApp
await client.connect();
await discoverGroups();
