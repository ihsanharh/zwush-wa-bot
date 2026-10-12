import fs from "node:fs";
import path from "node:path";
import { ConsoleLogger, createStore, WaClient } from "zapo-js";
import { createSqliteStore } from "@zapo-js/store-sqlite";
import qrcodeTerminal from "qrcode-terminal";
import { config } from "./config";
import { CoreClient } from "./coreClient";
import { StateManager } from "./state";
import { createWebhookApp, type BotMessageSender } from "./handlers/webhook";
import { handleIncomingMessage, type BotContext } from "./handlers/message";
import {
    extractMessageText,
    extractQuotedMessageId,
    extractEventTimestampSeconds,
    isEventStale,
    extractMentionedJids
} from "./utils/messageUtils";
import { AdminGroupLogger } from "./handlers/adminLogger";

console.log(`⚡ Starting ${config.STORE_NAME} WhatsApp Bot...`);

// Ensure auth directory exists
const authDir = path.dirname(config.AUTH_PATH);
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
}

// 1. Initialize SQLite Session Store for zapo-js
const store = createStore({
    backends: {
        sqlite: createSqliteStore({ path: config.AUTH_PATH })
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
        async sendMessage(jid: string, content: any, options?: any) {
            return await client.message.send(jid, content, options);
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
        },
        async getGroupMetadata(jid: string) {
            try {
                return await client.group.queryGroupMetadata(jid);
            } catch (err: unknown) {
                console.warn(`[Admin Logger] Failed to fetch group metadata for ${jid}:`, err);
                return null;
            }
        }
    }
);

let cachedBotJid: string | undefined;
let cachedBotLid: string | undefined;

// 2. Setup message context for handlers
const botContext: BotContext = {
    client: coreClient,
    state: stateManager,
    adminLogger,
    qrDeleter,
    get botJid() {
        return cachedBotJid || client.getCredentials()?.meJid;
    },
    set botJid(val: string | undefined) {
        cachedBotJid = val;
    },
    get botLid() {
        return cachedBotLid || client.getCredentials()?.meLid;
    },
    set botLid(val: string | undefined) {
        cachedBotLid = val;
    },
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
    },
    async sendList(jid: string, payload: { listMessage: any }) {
        console.log(`[WhatsApp Sending List to ${jid}]: ${payload.listMessage?.title}`);
        return await client.message.send(jid, payload);
    },
    async sendButtons(jid: string, payload: { interactiveMessage?: any; buttonsMessage?: any; headerImage?: Buffer }) {
        if (payload.headerImage && payload.interactiveMessage && !payload.interactiveMessage.header) {
            try {
                const uploaded = await client.message.upload(payload.headerImage, {
                    type: "image",
                    mimetype: "image/png"
                });
                payload.interactiveMessage.header = {
                    hasMediaAttachment: true,
                    imageMessage: {
                        url: uploaded.url,
                        directPath: uploaded.directPath,
                        mediaKey: uploaded.mediaKey,
                        fileSha256: uploaded.fileSha256,
                        fileEncSha256: uploaded.fileEncSha256,
                        fileLength: uploaded.fileLength,
                        mimetype: "image/png"
                    }
                };
            } catch (err) {
                console.warn(`[WhatsApp sendButtons] Failed to upload header image, sending without image header:`, err);
            }
        }

        const text =
            payload.interactiveMessage?.body?.text ||
            payload.buttonsMessage?.text ||
            payload.buttonsMessage?.contentText ||
            "";
        console.log(`[WhatsApp Sending Buttons to ${jid}]:\n${text ? text.slice(0, 100) + "..." : "(buttons)"}`);
        const sendContent: any = {};
        if (payload.interactiveMessage) {
            sendContent.interactiveMessage = payload.interactiveMessage;
        } else if (payload.buttonsMessage) {
            sendContent.buttonsMessage = payload.buttonsMessage;
        }

        return await client.message.send(jid, sendContent);
    },
    async uploadMedia(buffer: Buffer, mimetype: string = "image/png") {
        return await client.message.upload(buffer, {
            type: "image",
            mimetype
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

        if (adminLogger.getAdminGroupJid()) {
            await adminLogger.syncAdminParticipants();
            console.log(`[Groups] Synced admin participants (total identities: ${adminLogger.getAllAdminIdentities().length})`);
        }
    } catch (err: unknown) {
        console.error("[Groups] Failed to auto-discover groups:", err);
    }
}

// 4. Paired Authentication & Connection Events
client.on("connection", async (event) => {
    if (event.status === "open") {
        console.log(`✅ Connection open: ${event.reason}`);
        const creds = client.getCredentials();
        if (creds?.meJid) {
            botContext.botJid = creds.meJid;
        }
        if (creds?.meLid) {
            botContext.botLid = creds.meLid;
        }
        console.log(`[Bot Identity] botJid: ${botContext.botJid || "(none)"}, botLid: ${botContext.botLid || "(none)"}`);
        await discoverGroups();
    }
});

client.on("auth_paired", async ({ credentials }) => {
    console.log(`✅ Successfully paired as: ${credentials.meJid} (LID: ${credentials.meLid || "(none)"})`);
    botContext.botJid = credentials.meJid;
    if (credentials.meLid) {
        botContext.botLid = credentials.meLid;
    }
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
        if (!botContext.botJid || !botContext.botLid) {
            const creds = client.getCredentials();
            if (creds?.meJid && !botContext.botJid) botContext.botJid = creds.meJid;
            if (creds?.meLid && !botContext.botLid) botContext.botLid = creds.meLid;
        }

        const remoteJid = event.key?.remoteJid || "";
        const fromMe = Boolean(event.key?.fromMe);
        const participant = event.key?.participant ?? undefined;

        if (fromMe && participant) {
            if (participant.endsWith("@lid") && !botContext.botLid) {
                botContext.botLid = participant;
            } else if (participant.endsWith("@s.whatsapp.net") && !botContext.botJid) {
                botContext.botJid = participant;
            }
        }

        const text = extractMessageText(event.message);

        const staleCheck = isEventStale(event, 300);
        if (staleCheck.stale) {
            console.log(`[Message Ignored] Stale message (${staleCheck.reason}) from ${remoteJid}: "${text.slice(0, 30)}"`);
            return;
        }

        const tsSec = extractEventTimestampSeconds(event) ?? undefined;
        const quotedId = extractQuotedMessageId(event.message);
        const mentionedJids = extractMentionedJids(event.message);
        console.log(`[WhatsApp Message Event] from: ${remoteJid}, participant: ${participant}, fromMe: ${fromMe}, text: "${text}"${quotedId ? `, quotedId: ${quotedId}` : ""}`);

        await handleIncomingMessage(remoteJid, fromMe, text, botContext, participant, tsSec, quotedId, mentionedJids);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Message Event Error]:", msg);
    }
});

// 7. Start Webhook Server (Port 3001)
const webhookSender: BotMessageSender = {
    async sendMessage(jid: string, text: string) {
        console.log(`[WhatsApp Sending Text to ${jid}]:\n${text.slice(0, 100)}...`);
        await client.message.send(jid, text);
    },
    async sendButtons(jid: string, payload: any) {
        return await botContext.sendButtons!(jid, payload);
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
    hostname: "0.0.0.0",
    idleTimeout: 255
});
console.log(`🚀 Webhook server listening on http://0.0.0.0:${config.PORT}/webhook/order-update`);

// 8. Connect to WhatsApp
await client.connect();
await discoverGroups();
