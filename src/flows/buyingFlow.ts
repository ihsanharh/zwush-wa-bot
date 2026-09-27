import type { BotContext } from "../handlers/message";
import type { CatalogItem } from "../types";
import { formatRupiah, t, type Language } from "../i18n";
import { config } from "../config";
import { generateQrisBuffer } from "../qr";
import { getItemImageBuffer, resolveItemImageUrl } from "../poster";
import { CATEGORIES, resolveCategory } from "../utils/categories";
import { sendCategoryOrderPoster } from "../utils/formatters";
import { supportCommand } from "../commands/general/support";

export async function handleBuyingFlow(
    remoteJid: string,
    fromMe: boolean,
    text: string,
    ctx: BotContext,
    userLang: Language,
    effectiveSender?: string
): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    const session = ctx.state.getSession(remoteJid);

    // If IDLE, check if user directly types a category number / name from idle menu
    if (session.step === "IDLE") {
        const cat = resolveCategory(trimmed, CATEGORIES);
        if (cat) {
            ctx.state.setCategory(remoteJid, cat.dbCategory);
            await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
            return true;
        }
        return false;
    }

    // Navigation keywords: back (k/b) or cancel (c/b)
    if (session.step === "AWAITING_CATEGORY") {
        const isCancel = lower === "c" || lower === "cancel" || lower === "b" || lower === "batal";
        if (isCancel) {
            ctx.state.clear(remoteJid);
            await ctx.sendText(remoteJid, t("cancelSuccess", userLang));
            return true;
        }

        const cat = resolveCategory(trimmed, CATEGORIES);
        if (!cat) {
            if (fromMe) return true;
            await ctx.sendText(remoteJid, t("invalidCategory", userLang));
            return true;
        }

        ctx.state.setCategory(remoteJid, cat.dbCategory);
        await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
        return true;
    }

    if (session.step === "AWAITING_ITEM") {
        const isBack = lower === "k" || lower === "kembali" || lower === "back";
        if (isBack) {
            ctx.state.startBuyingFlow(remoteJid);
            const { renderOrderCategoryMenu } = await import("../utils/formatters");
            await ctx.sendText(remoteJid, renderOrderCategoryMenu(userLang));
            return true;
        }

        const isCancel = lower === "b" || lower === "batal" || lower === "c" || lower === "cancel";
        if (isCancel) {
            ctx.state.clear(remoteJid);
            await ctx.sendText(remoteJid, t("cancelSuccess", userLang));
            return true;
        }

        const catalog = await ctx.client.getCatalog();
        const selectedCat = session.selectedCategory;
        const categoryItems = selectedCat
            ? catalog.filter((i) => i.active && i.category === selectedCat)
            : catalog.filter((i) => i.active);

        let selected: CatalogItem | undefined;
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= categoryItems.length) {
            selected = categoryItems[num - 1];
        } else {
            selected = categoryItems.find(
                (i) => i.name.toLowerCase() === lower || (lower.length >= 3 && i.name.toLowerCase().includes(lower))
            );
        }

        if (!selected) {
            if (fromMe) return true;
            await ctx.sendText(remoteJid, t("invalidItem", userLang));
            return true;
        }

        ctx.state.setItem(remoteJid, selected);

        const promptText = userLang === "en" ? (
            `✨ *Great choice!* You selected: *${selected.name}*\n` +
            `💰 *Promo Price:* *${formatRupiah(selected.rupiahPrice)}* (Discount ${selected.discountPercent}%)\n` +
            `🏷️ *Normal Price:* ~${formatRupiah(selected.originalPrice)}~\n\n` +
            `🎮 Now, please enter your *Minecraft Bedrock Gamertag* (example: *Steve123*):\n` +
            `⚠️ *CRITICAL WARNING:* Please ensure your Gamertag is *100% accurate and valid* (check spelling, capitalization, and spaces). Once the item is sent, it *CANNOT BE CANCELLED OR REFUNDED* by anyone under any circumstances, not even by The Hive itself!\n\n` +
            `_(Type *b* to change item, or *c* to cancel)_`
        ) : (
            `✨ *Pilihan mantap kak! Kamu memilih:* *${selected.name}*\n` +
            `💰 *Harga Promo:* *${formatRupiah(selected.rupiahPrice)}* (Diskon ${selected.discountPercent}%)\n` +
            `🏷️ *Harga Normal:* ~${formatRupiah(selected.originalPrice)}~\n\n` +
            `🎮 Sekarang masukkan *Gamertag Minecraft Bedrock* kakak ya (contoh: *Steve123*):\n` +
            `⚠️ *PERINGATAN PENTING:* Pastikan Gamertag kakak sudah *100% benar dan valid* (perhatikan spasi, huruf besar/kecil). Jika item sudah terkirim ke gamertag tersebut, pesanan *TIDAK BISA DIBATALKAN / DI-REFUND* sama sekali oleh siapapun, termasuk oleh pihak The Hive sendiri!\n\n` +
            `_(Ketik *k* untuk ganti item, atau *b* untuk batalkan)_`
        );

        const imgUrl = resolveItemImageUrl(selected);
        let previewBuffer: Buffer | null = null;
        try {
            previewBuffer = await getItemImageBuffer(imgUrl);
        } catch {
            previewBuffer = null;
        }

        if (previewBuffer) {
            await ctx.sendImage(remoteJid, previewBuffer, promptText);
        } else {
            await ctx.sendText(remoteJid, promptText);
        }
        return true;
    }

    if (session.step === "AWAITING_RETRY_GAMERTAG") {
        if (lower === "/support" || lower.startsWith("/support ")) {
            await supportCommand.execute({
                remoteJid,
                sender: effectiveSender || remoteJid,
                args: [],
                rawText: text,
                isGroup: false,
                isAdmin: false,
                userLang,
                ctx,
            });
            return true;
        }

        if (lower === "c" || lower === "cancel" || lower === "batal") {
            ctx.state.clearRetryOrder(remoteJid);
            const cancelMsg = userLang === "en"
                ? `Retry session cancelled. Type */support* anytime if you need help!`
                : `Sesi pengiriman ulang dibatalkan. Ketik */support* jika butuh bantuan admin ya kak!`;
            await ctx.sendText(remoteJid, cancelMsg);
            return true;
        }

        const gamertag = trimmed;
        const isValidGamertag = /^[a-zA-Z0-9 _]{3,16}$/.test(gamertag);
        if (!isValidGamertag) {
            await ctx.sendText(remoteJid, t("invalidGamertag", userLang));
            return true;
        }

        const retry = session.retryOrder;
        if (!retry) {
            ctx.state.clearRetryOrder(remoteJid);
            return true;
        }

        retry.newGamertag = gamertag;
        session.step = "AWAITING_RETRY_CONFIRMATION";
        session.lastUpdated = Date.now();

        const confirmMsg = userLang === "en" ? (
            `📋 *CONFIRM NEW GAMERTAG*\n\n` +
            `🆔 Order ID: *#${retry.orderId}*\n` +
            `📦 Item: *${retry.itemName}*\n` +
            `👤 New Gamertag: *${gamertag}*\n\n` +
            `Please make sure the Gamertag spelling and spaces are exact!\n\n` +
            `Is this Gamertag correct?\n` +
            `👉 Reply *YES* to re-deliver to The Hive\n` +
            `👉 Reply *b* to change gamertag\n` +
            `👉 Reply *c* to cancel or type */support* for admin help`
        ) : (
            `📋 *KONFIRMASI GAMERTAG BARU*\n\n` +
            `🆔 Order ID: *#${retry.orderId}*\n` +
            `📦 Item: *${retry.itemName}*\n` +
            `👤 Gamertag Baru: *${gamertag}*\n\n` +
            `Mohon pastikan huruf besar/kecil dan spasi sudah benar ya kak.\n\n` +
            `Apakah data Gamertag ini sudah benar?\n` +
            `👉 Balas *YA* untuk memproses ulang pengiriman ke The Hive\n` +
            `👉 Balas *k* untuk ganti gamertag\n` +
            `👉 Balas *b* untuk membatalkan atau ketik */support* jika butuh bantuan admin`
        );

        await ctx.sendText(remoteJid, confirmMsg);
        return true;
    }

    if (session.step === "AWAITING_RETRY_CONFIRMATION") {
        if (lower === "/support" || lower.startsWith("/support ")) {
            await supportCommand.execute({
                remoteJid,
                sender: effectiveSender || remoteJid,
                args: [],
                rawText: text,
                isGroup: false,
                isAdmin: false,
                userLang,
                ctx,
            });
            return true;
        }

        const isYes = lower === "ya" || lower === "yes" || lower === "y" || lower === "deal" || lower === "ok";
        const retry = session.retryOrder;
        if (!retry) {
            ctx.state.clearRetryOrder(remoteJid);
            return true;
        }

        if (isYes) {
            try {
                const targetTag = retry.newGamertag || retry.oldGamertag;
                await ctx.client.updateOrderGamertag(retry.orderId, targetTag);
                const successMsg = userLang === "en" ? (
                    `✅ *GAMERTAG UPDATED!*\n\n` +
                    `Order *#${retry.orderId}* is being re-delivered to *${targetTag}* on The Hive.\n` +
                    `Please wait 1–2 minutes... 🎁`
                ) : (
                    `✅ *GAMERTAG BERHASIL DIPERBARUI!*\n\n` +
                    `Pesanan *#${retry.orderId}* sedang dikirim ulang ke Gamertag *${targetTag}* di The Hive.\n` +
                    `Mohon tunggu 1–2 menit ya kak... 🎁`
                );
                await ctx.sendText(remoteJid, successMsg);
                ctx.state.clearRetryOrder(remoteJid);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `❌ Gagal memproses ulang pesanan: ${errMsg}`);
            }
            return true;
        }

        const isChange = lower === "k" || lower === "b" || lower === "kembali" || lower === "back";
        if (isChange) {
            session.step = "AWAITING_RETRY_GAMERTAG";
            session.lastUpdated = Date.now();
            const prompt = userLang === "en"
                ? `Please enter your *correct Minecraft Bedrock Gamertag*:`
                : `Silakan masukkan *Gamertag Minecraft yang benar* ya kak:`;
            await ctx.sendText(remoteJid, prompt);
            return true;
        }

        const isCancel = lower === "c" || lower === "cancel" || lower === "batal";
        if (isCancel) {
            ctx.state.clearRetryOrder(remoteJid);
            const cancelMsg = userLang === "en"
                ? `Retry session cancelled. Type */support* anytime if you need help!`
                : `Sesi pengiriman ulang dibatalkan. Ketik */support* jika butuh bantuan admin ya kak!`;
            await ctx.sendText(remoteJid, cancelMsg);
            return true;
        }
        return true;
    }

    if (session.step === "AWAITING_GAMERTAG") {
        const isBack = lower === "k" || lower === "b" || lower === "kembali" || lower === "back";
        if (isBack) {
            const cat = CATEGORIES.find((c) => c.dbCategory === session.selectedCategory);
            if (cat) {
                session.step = "AWAITING_ITEM";
                session.lastUpdated = Date.now();
                await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
                return true;
            }
        }

        const isCancel = lower === "c" || lower === "cancel" || lower === "batal";
        if (isCancel) {
            ctx.state.clear(remoteJid);
            await ctx.sendText(remoteJid, t("cancelSuccess", userLang));
            return true;
        }

        const gamertag = trimmed;
        const isValidGamertag = /^[a-zA-Z0-9 _]{3,16}$/.test(gamertag);
        if (!isValidGamertag) {
            if (fromMe) return true;
            await ctx.sendText(remoteJid, t("invalidGamertag", userLang));
            return true;
        }

        ctx.state.setGamertag(remoteJid, gamertag);
        const item = session.selectedItem!;
        const voucherHint = t("voucherPrompt", userLang);

        const confirmText = userLang === "en" ? (
            `📋 *ORDER CONFIRMATION*\n\n` +
            `📦 Item: *${item.name}*\n` +
            `👤 Gamertag: *${gamertag}*\n` +
            `💰 Total Price: *${formatRupiah(item.rupiahPrice)}*\n\n` +
            `⚠️ *CRITICAL REMINDER:* Double-check your Gamertag (*${gamertag}*)! If it's valid and gifted, it *CANNOT BE UNDONE OR REFUNDED* (even The Hive cannot undo it).\n\n` +
            `Are the details above correct?\n` +
            `👉 Reply *YES* to generate payment QRIS\n` +
            `👉 ${voucherHint}\n` +
            `👉 Reply *b* to change gamertag\n` +
            `👉 Reply *c* to cancel`
        ) : (
            `📋 *KONFIRMASI PESANAN KAKAK*\n\n` +
            `📦 Item: *${item.name}*\n` +
            `👤 Gamertag: *${gamertag}*\n` +
            `💰 Total Harga: *${formatRupiah(item.rupiahPrice)}*\n\n` +
            `⚠️ *PERINGATAN PENTING:* Mohon teliti kembali Gamertag (*${gamertag}*)! Jika sudah terkirim, pesanan *TIDAK BISA DIBATALKAN ATAU DI-REFUND* sama sekali oleh siapapun (The Hive sendiri tidak bisa membatalkannya).\n\n` +
            `Apakah data di atas sudah benar kak?\n` +
            `👉 Balas *YA* untuk memproses QRIS pembayaran\n` +
            `👉 ${voucherHint}\n` +
            `👉 Balas *k* untuk ganti gamertag\n` +
            `👉 Balas *b* untuk membatalkan`
        );

        await ctx.sendText(remoteJid, confirmText);
        return true;
    }

    if (session.step === "AWAITING_CONFIRMATION") {
        const isBack = lower === "k" || lower === "b" || lower === "kembali" || lower === "back";
        if (isBack) {
            session.step = "AWAITING_GAMERTAG";
            session.lastUpdated = Date.now();
            const prompt = userLang === "en"
                ? `Please enter your *Minecraft Bedrock Gamertag*:`
                : `Silakan masukkan *Gamertag Minecraft Bedrock* kakak ya:`;
            await ctx.sendText(remoteJid, prompt);
            return true;
        }

        const isCancel = lower === "c" || lower === "cancel" || lower === "batal";
        if (isCancel) {
            ctx.state.clear(remoteJid);
            await ctx.sendText(remoteJid, t("cancelSuccess", userLang));
            return true;
        }

        // Check if user inputs voucher code
        const voucherMatch = trimmed.match(/^(?:voucher|kupon)\s*(.*)$/i);
        if (voucherMatch) {
            const code = voucherMatch[1]?.trim().toUpperCase();
            if (!code) {
                const hint = userLang === "en"
                    ? `💡 Please include the voucher code, e.g. *voucher SAVE10*`
                    : `💡 Mohon sertakan kode voucher ya kak, contoh: *voucher HEMAT*`;
                await ctx.sendText(remoteJid, hint);
                return true;
            }

            const item = session.selectedItem!;
            try {
                const res = await ctx.client.validateVoucher(code, item.name);
                ctx.state.setAppliedVoucher(remoteJid, {
                    code: res.code,
                    discountNominal: res.discountNominal,
                    finalPrice: res.finalPrice
                });

                let msg = t("voucherApplied", userLang, {
                    code: res.code,
                    discountNominal: res.discountNominal,
                    finalPrice: res.finalPrice
                });
                msg += userLang === "en"
                    ? `\n\n👉 Reply *YES* to proceed to payment\n👉 Reply *b* to change gamertag, *c* to cancel`
                    : `\n\n👉 Balas *YA* untuk lanjut ke pembayaran\n👉 Balas *k* untuk ganti gamertag, *b* untuk membatalkan`;
                await ctx.sendText(remoteJid, msg);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                if (errMsg.includes("EXHAUSTED") || errMsg.toLowerCase().includes("kuota")) {
                    await ctx.sendText(remoteJid, t("voucherExhausted", userLang, { code }));
                } else if (errMsg.includes("EXPIRED") || errMsg.toLowerCase().includes("kedaluwarsa")) {
                    await ctx.sendText(remoteJid, t("voucherExpired", userLang, { code }));
                } else {
                    await ctx.sendText(remoteJid, t("voucherInvalid", userLang, { code }));
                }
            }
            return true;
        }

        const isConfirmed =
            userLang === "en"
                ? (trimmed.toUpperCase() === "YES" || trimmed.toUpperCase() === "YA")
                : (trimmed.toUpperCase() === "YA");

        if (isConfirmed) {
            const item = session.selectedItem!;
            const gamertag = session.gamertag!;
            const appliedVoucher = session.appliedVoucher;

            try {
                const order = await ctx.client.createOrder(
                    gamertag,
                    item.name,
                    remoteJid,
                    appliedVoucher?.code
                );
                ctx.state.clear(remoteJid);

                let qrisBuffer: Buffer;
                try {
                    qrisBuffer = await ctx.client.getOrderQrPng(order.orderId);
                } catch {
                    qrisBuffer = await generateQrisBuffer(order.qrisString);
                }

                const voucherLine = appliedVoucher
                    ? `🏷️ Voucher: *${appliedVoucher.code}* (-${formatRupiah(appliedVoucher.discountNominal)})\n`
                    : "";

                const invoice = userLang === "en" ? (
                    `🧾 *${config.STORE_NAME.toUpperCase()} PAYMENT INVOICE*\n\n` +
                    `Hi! Your order has been successfully created 🎉\n\n` +
                    `🆔 Order ID: *#${order.orderId}*\n` +
                    `📦 Item: *${item.name}*\n` +
                    `👤 Gamertag: *${gamertag}*\n` +
                    voucherLine +
                    `💰 Total Payment: *${formatRupiah(order.totalNominal)}*\n\n` +
                    `⚠️ *IMPORTANT:* Please transfer the exact amount *${formatRupiah(order.totalNominal)}* (including the last 3-digit unique code) so our system can verify your payment automatically!\n\n` +
                    `⏱️ *Time Limit: 15 Minutes!*\n` +
                    `Please complete the payment within 15 minutes to avoid QRIS expiration. Thank you for shopping with ${config.STORE_NAME}! 🥰\n\n` +
                    `💡 _Forgot voucher or want to cancel? Type */cancel* or *cancel*._`
                ) : (
                    `🧾 *INVOICE PEMBAYARAN ${config.STORE_NAME.toUpperCase()}*\n\n` +
                    `Halo kak! Pesanan kakak sudah berhasil dibuat nih 🎉\n\n` +
                    `🆔 Order ID: *#${order.orderId}*\n` +
                    `📦 Item: *${item.name}*\n` +
                    `👤 Gamertag: *${gamertag}*\n` +
                    voucherLine +
                    `💰 Total Bayar: *${formatRupiah(order.totalNominal)}*\n\n` +
                    `⚠️ *PENTING YA KAK:* Mohon transfer tepat *${formatRupiah(order.totalNominal)}* (termasuk 3 digit kode unik) agar pembayaran otomatis terverifikasi sistem!\n\n` +
                    `⏱️ *Batas Waktu: 15 Menit!*\n` +
                    `Jangan transfer lewat dari 15 menit ya kak agar QRIS tidak kedaluwarsa. Terima kasih banyak sudah berbelanja di ${config.STORE_NAME}! 🥰\n\n` +
                    `💡 _Lupa voucher atau ingin batalkan? Ketik */batal* atau *batal*._`
                );

                const sent = await ctx.sendImage(remoteJid, qrisBuffer, invoice);
                const qrKey =
                    sent?.key ??
                    (sent?.id ? { id: sent.id, remoteJid, fromMe: true } : undefined);
                if (qrKey) {
                    ctx.state.setQrMessageKey(remoteJid, qrKey);
                }
                ctx.state.setActiveOrderId(remoteJid, order.orderId);

                if (ctx.adminLogger) {
                    await ctx.adminLogger.logNewOrder({
                        orderId: order.orderId,
                        itemName: item.name,
                        gamertag: gamertag,
                        totalNominal: order.totalNominal,
                        platformUserId: remoteJid
                    });
                }
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                ctx.state.clear(remoteJid);
                const failMsg = userLang === "en"
                    ? `❌ Oops, failed to create order: ${errMsg}\n\n💡 Please wait a moment and try again with */buy* or */katalog*.`
                    : `❌ Waduh, gagal membuat pesanan kak: ${errMsg}\n\n💡 Mohon tunggu beberapa saat dan coba lagi dengan */beli* atau */katalog* ya kak.`;
                await ctx.sendText(remoteJid, failMsg);
            }
            return true;
        }

        if (fromMe) return true;
        await ctx.sendText(remoteJid, t("confirmPrompt", userLang));
        return true;
    }

    return false;
}
