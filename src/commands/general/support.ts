import type { Command, CommandContext } from "../types";
import { config } from "../../config";

export const supportCommand: Command = {
    name: "/support",
    description: "Minta bantuan live chat langsung dengan admin",
    execute: async ({ remoteJid, userLang, ctx }: CommandContext) => {
        const session = ctx.state.getSession(remoteJid);
        if (session.step === "LIVE_CHAT") {
            const alreadyActiveMsg = userLang === "en"
                ? `💡 *Admin Live Chat is already active!*\nPlease feel free to send your messages directly here. Our admin will reply shortly! 🙏`
                : `💡 *Sesi Live Chat Admin sudah aktif!*\nSilakan langsung ketik pesan atau kendala kakak di sini ya. Admin kami akan segera membalas! 🙏`;
            await ctx.sendText(remoteJid, alreadyActiveMsg);
            return;
        }

        if (session.step === "AWAITING_SUPPORT_CONFIRMATION") {
            const alreadyPrompted = userLang === "en"
                ? `💡 You have a pending Live Chat confirmation.\n👉 Reply *YES* to start Live Chat with our admin, or *CANCEL* to return to the bot 😊`
                : `💡 Kakak sedang dalam konfirmasi Live Chat.\n👉 Balas *YA* untuk mulai obrolan langsung dengan admin, atau *BATAL* untuk kembali ke bot ya kak 😊`;
            await ctx.sendText(remoteJid, alreadyPrompted);
            return;
        }

        const retry = session.retryOrder || session.lastFailedOrder;
        let orderInfo: { orderId?: string; itemName?: string; gamertag?: string; attempts?: number } = {};

        if (retry) {
            orderInfo = {
                orderId: retry.orderId,
                itemName: retry.itemName,
                gamertag: (retry as any).newGamertag || (retry as any).oldGamertag || (retry as any).gamertag,
                attempts: retry.attempts
            };
        } else {
            try {
                const userOrders = await ctx.client.getUserOrders(remoteJid);
                if (userOrders && userOrders.length > 0) {
                    const latest = userOrders[0];
                    orderInfo = {
                        orderId: latest.id,
                        itemName: latest.itemName,
                        gamertag: latest.gamertag
                    };
                }
            } catch {}
        }

        // Set state to AWAITING_SUPPORT_CONFIRMATION to ask user consent first
        ctx.state.requestSupportConsent(remoteJid, orderInfo.orderId);

        const consentPrompt = userLang === "en" ? (
            `🛎️ *${config.STORE_NAME.toUpperCase()} LIVE CHAT SUPPORT* 👤💬\n\n` +
            `Do you want to start a *Live Chat* session with our human admin via WhatsApp?\n\n` +
            `⚠️ *Please note:* Automated bot commands and replies will be temporarily paused during the live chat session so you can talk directly with the store owner.\n\n` +
            `👉 Reply *YES* to start Live Chat with admin\n` +
            `👉 Reply *CANCEL* to stay with the automated bot`
        ) : (
            `🛎️ *BANTUAN LIVE CHAT ADMIN ${config.STORE_NAME.toUpperCase()}* 👤💬\n\n` +
            `Apakah kakak ingin memulai sesi *Live Chat* langsung dengan admin kami melalui WhatsApp?\n\n` +
            `⚠️ *Penting untuk diketahui:*\n` +
            `Balasan dan perintah otomatis bot akan dinonaktifkan sementara selama sesi live chat agar kakak bisa mengobrol santai langsung dengan admin toko.\n\n` +
            `👉 Balas *YA* untuk mulai Live Chat dengan admin\n` +
            `👉 Balas *BATAL* untuk tetap menggunakan bot otomatis`
        );
        await ctx.sendText(remoteJid, consentPrompt);
    },
};

export default supportCommand;
