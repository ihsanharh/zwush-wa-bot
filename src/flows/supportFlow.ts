import type { BotContext } from "../handlers/message";
import type { Language } from "../i18n";

export function isLiveChatActive(remoteJid: string, ctx: BotContext): boolean {
    const session = ctx.state.getSession(remoteJid);
    return session.step === "LIVE_CHAT";
}

export function isAwaitingSupportConfirmation(remoteJid: string, ctx: BotContext): boolean {
    const session = ctx.state.getSession(remoteJid);
    return session.step === "AWAITING_SUPPORT_CONFIRMATION";
}

export async function handleSupportConfirmation(
    remoteJid: string,
    text: string,
    ctx: BotContext,
    userLang: Language,
    effectiveSender?: string
): Promise<boolean> {
    const session = ctx.state.getSession(remoteJid);
    if (session.step !== "AWAITING_SUPPORT_CONFIRMATION") {
        return false;
    }

    const lower = text.trim().toLowerCase();

    const isYes =
        lower === "ya" ||
        lower === "yes" ||
        lower === "y" ||
        lower === "1" ||
        lower === "lanjut" ||
        lower === "oke" ||
        lower === "ok" ||
        lower === "siap";

    const isCancel =
        lower === "batal" ||
        lower === "cancel" ||
        lower === "tidak" ||
        lower === "no" ||
        lower === "gak" ||
        lower === "ngga" ||
        lower === "c" ||
        lower === "b";

    if (isYes) {
        const targetOrderId = session.pendingSupportOrderId;
        ctx.state.startLiveChat(remoteJid, targetOrderId);

        const activeLiveMsg = userLang === "en" ? (
            `✅ *LIVE CHAT MODE ACTIVE* 👤💬\n\n` +
            `You are now connected to *Admin Live Chat* mode.\n` +
            `Our human admin will reply directly to your messages in this WhatsApp chat as soon as possible.\n\n` +
            `⚠️ *Note:* Automated bot replies are paused during this live chat session.\n\n` +
            `Please send your questions or order details below! 🙏`
        ) : (
            `✅ *MODE LIVE CHAT AKTIF* 👤💬\n\n` +
            `Kakak sekarang telah terhubung ke mode *Live Chat Admin*.\n` +
            `Pesan kakak selanjutnya akan langsung dibaca dan dibalas oleh admin kami secara manual melalui WhatsApp.\n\n` +
            `⚠️ *Catatan:* Balasan otomatis bot dinonaktifkan sementara selama sesi live chat ini.\n\n` +
            `Silakan ketik pertanyaan atau detail kendala yang kakak alami di bawah ini ya! Admin kami akan segera membalas 🙏`
        );
        await ctx.sendText(remoteJid, activeLiveMsg);

        // Alert admin group
        if (ctx.adminLogger) {
            const retry = session.retryOrder || session.lastFailedOrder;
            await ctx.adminLogger.notifySupportRequest({
                orderId: targetOrderId || retry?.orderId,
                itemName: retry?.itemName,
                gamertag: (retry as any)?.newGamertag || (retry as any)?.oldGamertag || (retry as any)?.gamertag,
                attempts: retry?.attempts,
                platformUserId: effectiveSender || remoteJid,
                reason: retry?.attempts && retry.attempts >= 3
                    ? `Gamertag tidak ditemukan di The Hive setelah ${retry.attempts}x percobaan`
                    : "Pelanggan menyetujui masuk ke mode Live Chat Support via /support"
            });
        }
        return true;
    }

    if (isCancel) {
        ctx.state.cancelSupportConsent(remoteJid);
        const cancelNotice = userLang === "en"
            ? `💡 Live chat cancelled. Our automated bot is active again 😊\nType */katalog* to view our catalog or */help* for command list.`
            : `💡 Sesi live chat dibatalkan. Bot kami telah aktif kembali ya kak 😊\nKetik */katalog* untuk melihat katalog item atau */bantuan* untuk daftar perintah.`;
        await ctx.sendText(remoteJid, cancelNotice);
        return true;
    }

    const promptHint = userLang === "en"
        ? `💡 Please reply *YES* to start Live Chat with our admin, or *CANCEL* to stay with the automated bot 😊`
        : `💡 Mohon balas *YA* untuk mulai Live Chat dengan admin, atau balas *BATAL* untuk kembali ke bot ya kak 😊`;
    await ctx.sendText(remoteJid, promptHint);
    return true;
}
