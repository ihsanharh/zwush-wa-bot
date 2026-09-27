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

    // If IDLE, buying flow is not active; user must use /beli to start ordering
    if (session.step === "IDLE") {
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

        const promptText = t("buying.gamertagPrompt", userLang, {
            itemName: selected.name,
            rupiahPrice: formatRupiah(selected.rupiahPrice),
            discountPercent: selected.discountPercent,
            originalPrice: formatRupiah(selected.originalPrice)
        });

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
            await ctx.sendText(remoteJid, t("buying.retryCancelled", userLang));
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

        const confirmMsg = t("buying.retryConfirm", userLang, {
            orderId: retry.orderId,
            itemName: retry.itemName,
            gamertag
        });

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
                const successMsg = t("buying.retrySuccess", userLang, {
                    orderId: retry.orderId,
                    itemName: retry.itemName,
                    gamertag: targetTag
                });
                await ctx.sendText(remoteJid, successMsg);
                ctx.state.clearRetryOrder(remoteJid);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, t("buying.retryError", userLang, { error: errMsg }));
            }
            return true;
        }

        const isChange = lower === "k" || lower === "b" || lower === "kembali" || lower === "back";
        if (isChange) {
            session.step = "AWAITING_RETRY_GAMERTAG";
            session.lastUpdated = Date.now();
            await ctx.sendText(remoteJid, t("buying.enterCorrectGamertag", userLang));
            return true;
        }

        const isCancel = lower === "c" || lower === "cancel" || lower === "batal";
        if (isCancel) {
            ctx.state.clearRetryOrder(remoteJid);
            await ctx.sendText(remoteJid, t("buying.retryCancelled", userLang));
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

        const confirmText = t("buying.confirmPrompt", userLang, {
            itemName: item.name,
            gamertag,
            formattedPrice: formatRupiah(item.rupiahPrice),
            voucherHint
        });

        await ctx.sendText(remoteJid, confirmText);
        return true;
    }

    if (session.step === "AWAITING_CONFIRMATION") {
        const isBack = lower === "k" || lower === "b" || lower === "kembali" || lower === "back";
        if (isBack) {
            session.step = "AWAITING_GAMERTAG";
            session.lastUpdated = Date.now();
            await ctx.sendText(remoteJid, t("buying.enterGamertagPrompt", userLang));
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
                await ctx.sendText(remoteJid, t("buying.voucherMatchHint", userLang));
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
                msg += t("buying.voucherProceedHint", userLang);
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
            trimmed.toUpperCase() === "YES" ||
            trimmed.toUpperCase() === "YA" ||
            trimmed.toUpperCase() === "Y" ||
            trimmed.toUpperCase() === "OK" ||
            trimmed.toUpperCase() === "OKE";

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
                    ? t("buying.invoiceVoucherLine", userLang, {
                        code: appliedVoucher.code,
                        formattedDiscount: formatRupiah(appliedVoucher.discountNominal)
                    })
                    : "";

                const invoice = t("buying.invoiceText", userLang, {
                    orderId: order.orderId,
                    itemName: item.name,
                    gamertag,
                    voucherLine,
                    formattedAmount: formatRupiah(order.totalNominal),
                    store: config.STORE_NAME
                });

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
                await ctx.sendText(remoteJid, t("buying.orderCreateError", userLang, { error: errMsg }));
            }
            return true;
        }

        if (fromMe) return true;
        await ctx.sendText(remoteJid, t("buying.confirmReminder", userLang));
        return true;
    }

    return false;
}
