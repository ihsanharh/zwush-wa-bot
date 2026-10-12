import type { BotContext } from "../handlers/message";
import type { CatalogItem } from "../types";
import { formatRupiah, t, type Language } from "../i18n";
import { config } from "../config";
import { generateQrisBuffer } from "../qr";
import { getItemImageBuffer, resolveItemImageUrl } from "../poster";
import { CATEGORIES, findCategory } from "../utils/categories";
import { sendCategoryOrderPoster, renderOrderCategoryMenu } from "../utils/formatters";
import { GREETINGS } from "../utils/messageUtils";
import {
    buildCategoryListMenu,
    buildPaginatedItemListMenu,
    buildGamertagPromptButtons,
    buildGamertagChangePromptButtons,
    buildOrderConfirmationButtons,
    buildModifyOrderListMenu,
    buildInvoiceButtons,
    buildOrderCancelledButtons,
    buildVoucherPromptButtons,
    buildQuickReplyPayload
} from "../utils/interactiveBuilders";

async function sendItemSelectionAndGamertagPrompt(
    remoteJid: string,
    selected: CatalogItem,
    userLang: Language,
    ctx: BotContext
): Promise<void> {
    const itemCardText = selected.discountPercent && selected.discountPercent > 0
        ? t("buying.selectedItemCard", userLang, {
            itemName: selected.name,
            rupiahPrice: formatRupiah(selected.rupiahPrice),
            discountPercent: selected.discountPercent,
            originalPrice: formatRupiah(selected.originalPrice)
        })
        : t("buying.selectedItemCardNoDiscount", userLang, {
            itemName: selected.name,
            rupiahPrice: formatRupiah(selected.rupiahPrice)
        });

    const askGamertagText = t("buying.askGamertagPrompt", userLang);

    const imgUrl = resolveItemImageUrl(selected);
    let previewBuffer: Buffer | null = null;
    try {
        previewBuffer = await getItemImageBuffer(imgUrl);
    } catch {
        previewBuffer = null;
    }

    // Pesan 1: Gambar + pilihan mantap + action buttons
    if (ctx.sendButtons) {
        const sent = await ctx.sendButtons(
            remoteJid,
            buildGamertagPromptButtons(itemCardText, userLang, previewBuffer || undefined)
        );
        const msgId = sent?.key?.id || sent?.id;
        if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
    } else if (previewBuffer) {
        await ctx.sendImage(remoteJid, previewBuffer, itemCardText);
    } else {
        await ctx.sendText(remoteJid, itemCardText);
    }

    // Pesan 2: Tanya input gamertag
    await ctx.sendText(remoteJid, askGamertagText);
}

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

    // 0. Stateless Catalog Browsing (only handled when session is IDLE and no active pending order)
    if (session.step === "IDLE" && !ctx.state.getActiveOrderId(remoteJid)) {
        if (trimmed.startsWith("cat_")) {
            const cat = findCategory(trimmed);

            if (cat) {
                session.selectedCategory = cat.dbCategory;
                session.catalogPage = 1;
                await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
                const catalog = await ctx.client.getCatalog();
                if (ctx.sendList) {
                    await ctx.sendList(remoteJid, buildPaginatedItemListMenu(catalog, cat, 1, 8, userLang));
                }
                return true;
            }
            return true;
        }

        if (trimmed === "nav_change_cat") {
            if (ctx.sendList) {
                await ctx.sendList(remoteJid, buildCategoryListMenu(CATEGORIES, userLang));
            } else {
                await ctx.sendText(remoteJid, renderOrderCategoryMenu(userLang));
            }
            return true;
        }

        if (trimmed.startsWith("nav_page_")) {
            const pageNum = parseInt(trimmed.replace(/^nav_page_/, ""), 10) || 1;
            ctx.state.setCatalogPage(remoteJid, pageNum);
            const cat = CATEGORIES.find((c) => c.dbCategory === session.selectedCategory);
            if (cat) {
                const catalog = await ctx.client.getCatalog();
                if (ctx.sendList) {
                    await ctx.sendList(remoteJid, buildPaginatedItemListMenu(catalog, cat, pageNum, 8, userLang));
                }
            }
            return true;
        }

        if (trimmed.startsWith("item_")) {
            const itemId = trimmed.replace(/^item_/, "");
            const catalog = await ctx.client.getCatalog();
            const selectedCat = session.selectedCategory;
            const categoryItems = selectedCat
                ? catalog.filter((i) => i.active && i.category === selectedCat)
                : catalog.filter((i) => i.active);

            const selected =
                categoryItems.find(
                    (i) =>
                        String(i.id) === itemId ||
                        i.name.toLowerCase() === itemId.toLowerCase() ||
                        (i.sku && i.sku.toLowerCase() === itemId.toLowerCase())
                ) ||
                catalog.find(
                    (i) =>
                        String(i.id) === itemId ||
                        i.name.toLowerCase() === itemId.toLowerCase() ||
                        (i.sku && i.sku.toLowerCase() === itemId.toLowerCase())
                );

            if (selected) {
                ctx.state.setItem(remoteJid, selected);
                if (selected.category) {
                    session.selectedCategory = selected.category;
                    const catItems = catalog.filter((i) => i.active && i.category === selected.category);
                    const idx = catItems.findIndex((i) => i.id === selected.id || i.name === selected.name);
                    if (idx >= 0) {
                        ctx.state.setCatalogPage(remoteJid, Math.floor(idx / 8) + 1);
                    }
                }

                // Auto-revalidate applied voucher if user changed item
                if (session.appliedVoucherCode) {
                    try {
                        const res = await ctx.client.validateVoucher(session.appliedVoucherCode, selected.name);
                        ctx.state.setAppliedVoucher(remoteJid, {
                            code: res.code,
                            discountNominal: res.discountNominal,
                            finalPrice: res.finalPrice
                        });
                    } catch {
                        ctx.state.clearAppliedVoucher(remoteJid);
                    }
                }

                // If user already entered gamertag previously, skip gamertag prompt and go directly to confirmation
                if (session.gamertag) {
                    session.step = "AWAITING_CONFIRMATION";
                    const appliedVoucher = session.appliedVoucher;
                    let voucherLine = "";
                    if (appliedVoucher) {
                        voucherLine = t("buying.invoiceVoucherLine", userLang, {
                            code: appliedVoucher.code,
                            formattedDiscount: formatRupiah(appliedVoucher.discountNominal)
                        });
                    }

                    const summaryText = t("buying.confirmPrompt", userLang, {
                        itemName: selected.name,
                        gamertag: session.gamertag,
                        formattedPrice: formatRupiah(appliedVoucher ? appliedVoucher.finalPrice : selected.rupiahPrice),
                        voucherLine: appliedVoucher ? `\n${voucherLine}` : ""
                    });

                    if (ctx.sendButtons) {
                        const sent = await ctx.sendButtons(
                            remoteJid,
                            buildOrderConfirmationButtons(summaryText, Boolean(appliedVoucher), userLang)
                        );
                        const msgId = sent?.key?.id || sent?.id;
                        if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
                    } else {
                        await ctx.sendText(remoteJid, summaryText);
                    }
                    return true;
                }

                await sendItemSelectionAndGamertagPrompt(remoteJid, selected, userLang, ctx);
                return true;
            }
            return true;
        }

        return false;
    }

    // 1. AWAITING_CATEGORY (Legacy text compatibility)
    if (session.step === "AWAITING_CATEGORY") {
        if (
            trimmed === "act_cancel" ||
            trimmed === "btn_cancel_order" ||
            trimmed === "opt_cancel_order"
        ) {
            ctx.state.clear(remoteJid);
            const msg = t("cancelSuccess", userLang);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buildOrderCancelledButtons(msg, userLang));
            } else {
                await ctx.sendText(remoteJid, msg);
            }
            return true;
        }

        if (trimmed.startsWith("cat_")) {
            const cat = findCategory(trimmed);
            if (cat) {
                session.selectedCategory = cat.dbCategory;
                session.catalogPage = 1;
                await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
                const catalog = await ctx.client.getCatalog();
                if (ctx.sendList) {
                    await ctx.sendList(remoteJid, buildPaginatedItemListMenu(catalog, cat, 1, 8, userLang));
                }
                return true;
            }
        }

        return true;
    }

    // 2. AWAITING_ITEM (Legacy text compatibility)
    if (session.step === "AWAITING_ITEM") {
        if (
            trimmed === "act_cancel" ||
            trimmed === "btn_cancel_order" ||
            trimmed === "opt_cancel_order"
        ) {
            ctx.state.clear(remoteJid);
            const msg = t("cancelSuccess", userLang);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buildOrderCancelledButtons(msg, userLang));
            } else {
                await ctx.sendText(remoteJid, msg);
            }
            return true;
        }

        const catalog = await ctx.client.getCatalog();
        const selectedCat = session.selectedCategory;
        const categoryItems = selectedCat
            ? catalog.filter((i) => i.active && i.category === selectedCat)
            : catalog.filter((i) => i.active);

        if (!trimmed.startsWith("item_")) {
            return true;
        }

        const itemId = trimmed.replace(/^item_/, "");
        const selected: CatalogItem | undefined =
            categoryItems.find(
                (i) =>
                    String(i.id) === itemId ||
                    i.name.toLowerCase() === itemId.toLowerCase() ||
                    (i.sku && i.sku.toLowerCase() === itemId.toLowerCase())
            ) ||
            catalog.find(
                (i) =>
                    String(i.id) === itemId ||
                    i.name.toLowerCase() === itemId.toLowerCase() ||
                    (i.sku && i.sku.toLowerCase() === itemId.toLowerCase())
            );

        if (selected) {
            ctx.state.setItem(remoteJid, selected);
            if (selected.category) {
                session.selectedCategory = selected.category;
                const catItems = catalog.filter((i) => i.active && i.category === selected.category);
                const idx = catItems.findIndex((i) => i.id === selected.id || i.name === selected.name);
                if (idx >= 0) {
                    ctx.state.setCatalogPage(remoteJid, Math.floor(idx / 8) + 1);
                }
            }

            if (session.appliedVoucherCode) {
                try {
                    const res = await ctx.client.validateVoucher(session.appliedVoucherCode, selected.name);
                    ctx.state.setAppliedVoucher(remoteJid, {
                        code: res.code,
                        discountNominal: res.discountNominal,
                        finalPrice: res.finalPrice
                    });
                } catch {
                    ctx.state.clearAppliedVoucher(remoteJid);
                }
            }

            // If user already entered gamertag previously, skip gamertag prompt and go directly to confirmation
            if (session.gamertag) {
                session.step = "AWAITING_CONFIRMATION";
                const appliedVoucher = session.appliedVoucher;
                let voucherLine = "";
                if (appliedVoucher) {
                    voucherLine = t("buying.invoiceVoucherLine", userLang, {
                        code: appliedVoucher.code,
                        formattedDiscount: formatRupiah(appliedVoucher.discountNominal)
                    });
                }

                const summaryText = t("buying.confirmPrompt", userLang, {
                    itemName: selected.name,
                    gamertag: session.gamertag,
                    formattedPrice: formatRupiah(appliedVoucher ? appliedVoucher.finalPrice : selected.rupiahPrice),
                    voucherLine: appliedVoucher ? `\n${voucherLine}` : ""
                });

                if (ctx.sendButtons) {
                    const sent = await ctx.sendButtons(
                        remoteJid,
                        buildOrderConfirmationButtons(summaryText, Boolean(appliedVoucher), userLang)
                    );
                    const msgId = sent?.key?.id || sent?.id;
                    if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
                } else {
                    await ctx.sendText(remoteJid, summaryText);
                }
                return true;
            }

            await sendItemSelectionAndGamertagPrompt(remoteJid, selected, userLang, ctx);
            return true;
        }

        return true;
    }

    if (session.step === "AWAITING_RETRY_GAMERTAG") {
        if (trimmed === "act_cancel" || trimmed === "btn_cancel_order") {
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

        if (ctx.sendButtons) {
            await ctx.sendButtons(
                remoteJid,
                buildQuickReplyPayload(
                    confirmMsg,
                    [
                        { id: "act_retry_yes", text: t("buttons.confirmOrder", userLang) },
                        { id: "act_cancel", text: t("buttons.cancelOrder", userLang) }
                    ]
                )
            );
        } else {
            await ctx.sendText(remoteJid, confirmMsg);
        }
        return true;
    }

    // 4. AWAITING_RETRY_CONFIRMATION
    if (session.step === "AWAITING_RETRY_CONFIRMATION") {

        const isYes =
            trimmed === "act_retry_yes" ||
            trimmed === "btn_retry_confirm";
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

        if (trimmed === "act_cancel" || trimmed === "btn_cancel_order") {
            ctx.state.clearRetryOrder(remoteJid);
            await ctx.sendText(remoteJid, t("buying.retryCancelled", userLang));
            return true;
        }
        return true;
    }

    // 5. AWAITING_GAMERTAG
    if (session.step === "AWAITING_GAMERTAG") {
        if (
            trimmed === "btn_cancel_gamertag" ||
            trimmed === "btn_cancel_voucher"
        ) {
            if (session.gamertag && session.selectedItem) {
                session.step = "AWAITING_CONFIRMATION";
                session.lastUpdated = Date.now();
                const item = session.selectedItem;
                const appliedVoucher = session.appliedVoucher;
                let voucherLine = "";
                if (appliedVoucher) {
                    voucherLine = t("buying.invoiceVoucherLine", userLang, {
                        code: appliedVoucher.code,
                        formattedDiscount: formatRupiah(appliedVoucher.discountNominal)
                    });
                }
                const summaryText = t("buying.confirmPrompt", userLang, {
                    itemName: item.name,
                    gamertag: session.gamertag,
                    formattedPrice: formatRupiah(appliedVoucher ? appliedVoucher.finalPrice : item.rupiahPrice),
                    voucherLine: appliedVoucher ? `\n${voucherLine}` : ""
                });
                if (ctx.sendButtons) {
                    const sent = await ctx.sendButtons(
                        remoteJid,
                        buildOrderConfirmationButtons(summaryText, Boolean(appliedVoucher), userLang)
                    );
                    const msgId = sent?.key?.id || sent?.id;
                    if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
                }
                return true;
            }
            ctx.state.clear(remoteJid);
            await ctx.sendText(remoteJid, t("cancelSuccess", userLang));
            return true;
        }

        if (
            trimmed === "act_cancel" ||
            trimmed === "btn_cancel_order" ||
            trimmed === "opt_cancel_order"
        ) {
            ctx.state.clear(remoteJid);
            const msg = t("cancelSuccess", userLang);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buildOrderCancelledButtons(msg, userLang));
            } else {
                await ctx.sendText(remoteJid, msg);
            }
            return true;
        }

        if (
            trimmed === "btn_modify_change_item" ||
            trimmed === "opt_change_item"
        ) {
            session.step = "IDLE";
            ctx.state.setPromptMessageId(remoteJid, undefined);
            session.lastUpdated = Date.now();
            const cat = findCategory(session.selectedCategory);
            if (cat) {
                const catalog = await ctx.client.getCatalog();
                if (ctx.sendList) {
                    await ctx.sendList(
                        remoteJid,
                        buildPaginatedItemListMenu(catalog, cat, ctx.state.getCatalogPage(remoteJid), 8, userLang)
                    );
                } else {
                    await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
                }
            } else {
                if (ctx.sendList) {
                    await ctx.sendList(remoteJid, buildCategoryListMenu(CATEGORIES, userLang));
                } else {
                    await ctx.sendText(remoteJid, renderOrderCategoryMenu(userLang));
                }
            }
            return true;
        }

        // Drop any stale button / interactive payload that wasn't handled above
        if (/^(cat_|item_|nav_|btn_|act_|opt_|cmd_|admin_)/i.test(trimmed)) {
            return true;
        }

        const cleanGreeting = lower.replace(/[!.,?]+$/, "").trim();
        if (GREETINGS.includes(cleanGreeting)) {
            await ctx.sendText(remoteJid, t("invalidGamertag", userLang));
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

        // Auto-revalidate voucher if previously applied
        if (session.appliedVoucherCode && session.selectedItem) {
            try {
                const res = await ctx.client.validateVoucher(session.appliedVoucherCode, session.selectedItem.name);
                ctx.state.setAppliedVoucher(remoteJid, {
                    code: res.code,
                    discountNominal: res.discountNominal,
                    finalPrice: res.finalPrice
                });
            } catch {
                ctx.state.clearAppliedVoucher(remoteJid);
            }
        }

        const item = session.selectedItem!;
        const appliedVoucher = session.appliedVoucher;
        let voucherLine = "";
        if (appliedVoucher) {
            voucherLine = t("buying.invoiceVoucherLine", userLang, {
                code: appliedVoucher.code,
                formattedDiscount: formatRupiah(appliedVoucher.discountNominal)
            });
        }

        const summaryText = t("buying.confirmPrompt", userLang, {
            itemName: item.name,
            gamertag,
            formattedPrice: formatRupiah(appliedVoucher ? appliedVoucher.finalPrice : item.rupiahPrice),
            voucherLine: appliedVoucher ? `\n${voucherLine}` : ""
        });

        if (ctx.sendButtons) {
            const sent = await ctx.sendButtons(
                remoteJid,
                buildOrderConfirmationButtons(summaryText, Boolean(appliedVoucher), userLang)
            );
            const msgId = sent?.key?.id || sent?.id;
            if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
        } else {
            await ctx.sendText(remoteJid, summaryText);
        }
        return true;
    }

    // 6. AWAITING_CONFIRMATION
    if (session.step === "AWAITING_CONFIRMATION") {
        if (
            trimmed === "btn_modify_cancel" ||
            trimmed === "opt_cancel_order" ||
            trimmed === "act_cancel" ||
            trimmed === "btn_cancel_order"
        ) {
            ctx.state.clear(remoteJid);
            const msg = t("cancelSuccess", userLang);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buildOrderCancelledButtons(msg, userLang));
            } else {
                await ctx.sendText(remoteJid, msg);
            }
            return true;
        }

        if (trimmed === "btn_open_voucher") {
            ctx.state.setAwaitingVoucher(remoteJid);
            const promptText = t("interactive.voucherInputPrompt", userLang);
            if (ctx.sendButtons) {
                const sent = await ctx.sendButtons(
                    remoteJid,
                    buildVoucherPromptButtons(promptText, userLang)
                );
                const msgId = sent?.key?.id || sent?.id;
                if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
            } else {
                await ctx.sendText(remoteJid, promptText);
            }
            return true;
        }

        if (trimmed === "btn_remove_voucher") {
            ctx.state.clearAppliedVoucher(remoteJid);
            const item = session.selectedItem!;
            const summaryText = t("buying.confirmPrompt", userLang, {
                itemName: item.name,
                gamertag: session.gamertag!,
                formattedPrice: formatRupiah(item.rupiahPrice),
                voucherLine: ""
            });
            if (ctx.sendButtons) {
                const sent = await ctx.sendButtons(
                    remoteJid,
                    buildOrderConfirmationButtons(summaryText, false, userLang)
                );
                const msgId = sent?.key?.id || sent?.id;
                if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
            } else {
                await ctx.sendText(remoteJid, t("voucherRemoved", userLang));
            }
            return true;
        }

        if (trimmed === "btn_modify_menu") {
            if (ctx.sendList) {
                const sent = await ctx.sendList(remoteJid, buildModifyOrderListMenu(userLang));
                const msgId = sent?.key?.id || sent?.id;
                if (msgId) ctx.state.addPromptMessageId(remoteJid, String(msgId));
            }
            return true;
        }

        if (trimmed === "btn_modify_change_gt" || trimmed === "opt_change_gamertag") {
            session.step = "AWAITING_GAMERTAG";
            session.lastUpdated = Date.now();
            const prompt = t("buying.enterGamertagPrompt", userLang);
            if (ctx.sendButtons) {
                const sent = await ctx.sendButtons(
                    remoteJid,
                    buildGamertagChangePromptButtons(prompt, userLang)
                );
                const msgId = sent?.key?.id || sent?.id;
                if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
            } else {
                await ctx.sendText(remoteJid, prompt);
            }
            return true;
        }

        if (trimmed === "btn_modify_change_item" || trimmed === "opt_change_item") {
            session.step = "IDLE";
            ctx.state.setPromptMessageId(remoteJid, undefined);
            session.lastUpdated = Date.now();
            const cat = findCategory(session.selectedCategory);
            if (cat) {
                const catalog = await ctx.client.getCatalog();
                if (ctx.sendList) {
                    await ctx.sendList(
                        remoteJid,
                        buildPaginatedItemListMenu(catalog, cat, ctx.state.getCatalogPage(remoteJid), 8, userLang)
                    );
                } else {
                    await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
                }
            } else {
                if (ctx.sendList) {
                    await ctx.sendList(remoteJid, buildCategoryListMenu(CATEGORIES, userLang));
                } else {
                    await ctx.sendText(remoteJid, renderOrderCategoryMenu(userLang));
                }
            }
            return true;
        }

        // Check if user inputs voucher code directly in confirmation
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

                const summaryText = t("buying.confirmPrompt", userLang, {
                    itemName: item.name,
                    gamertag: session.gamertag!,
                    formattedPrice: formatRupiah(res.finalPrice),
                    voucherLine: "\n" + t("buying.invoiceVoucherLine", userLang, {
                        code: res.code,
                        formattedDiscount: formatRupiah(res.discountNominal)
                    })
                });

                if (ctx.sendButtons) {
                    const sent = await ctx.sendButtons(
                        remoteJid,
                        buildOrderConfirmationButtons(summaryText, true, userLang)
                    );
                    const msgId = sent?.key?.id || sent?.id;
                    if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
                } else {
                    let msg = t("voucherApplied", userLang, {
                        code: res.code,
                        discountNominal: res.discountNominal,
                        finalPrice: res.finalPrice
                    });
                    msg += t("buying.voucherProceedHint", userLang);
                    await ctx.sendText(remoteJid, msg);
                }
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

        const isConfirmed = trimmed === "btn_confirm_order";

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

                // Send 2 invoice quick-reply buttons below QR
                if (ctx.sendButtons) {
                    const sent = await ctx.sendButtons(remoteJid, buildInvoiceButtons(invoice, userLang));
                    const msgId = sent?.key?.id || sent?.id;
                    if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
                }

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

        // Zero-text policy: Silently drop any other text in AWAITING_CONFIRMATION
        return true;
    }

    // 7. AWAITING_VOUCHER_CODE
    if (session.step === "AWAITING_VOUCHER_CODE") {
        if (
            trimmed === "btn_cancel_voucher" ||
            trimmed === "btn_cancel_order" ||
            trimmed === "opt_cancel_order" ||
            trimmed === "act_cancel"
        ) {
            session.step = "AWAITING_CONFIRMATION";
            session.lastUpdated = Date.now();
            const item = session.selectedItem!;
            const summaryText = t("buying.confirmPrompt", userLang, {
                itemName: item.name,
                gamertag: session.gamertag!,
                formattedPrice: formatRupiah(session.appliedVoucher ? session.appliedVoucher.finalPrice : item.rupiahPrice),
                voucherLine: session.appliedVoucher
                    ? "\n" + t("buying.invoiceVoucherLine", userLang, {
                        code: session.appliedVoucher.code,
                        formattedDiscount: formatRupiah(session.appliedVoucher.discountNominal)
                    })
                    : ""
            });
            if (ctx.sendButtons) {
                const sent = await ctx.sendButtons(
                    remoteJid,
                    buildOrderConfirmationButtons(summaryText, Boolean(session.appliedVoucher), userLang)
                );
                const msgId = sent?.key?.id || sent?.id;
                if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
            }
            return true;
        }

        // Drop any stale button / interactive payload that wasn't handled above
        if (/^(cat_|item_|nav_|btn_|act_|opt_|cmd_|admin_)/i.test(trimmed)) {
            return true;
        }

        const code = trimmed.replace(/^(?:voucher|kupon)\s*/i, "").trim().toUpperCase();
        const item = session.selectedItem!;

        try {
            const res = await ctx.client.validateVoucher(code, item.name);
            ctx.state.setAppliedVoucher(remoteJid, {
                code: res.code,
                discountNominal: res.discountNominal,
                finalPrice: res.finalPrice
            });
            session.step = "AWAITING_CONFIRMATION";
            session.lastUpdated = Date.now();

            const summaryText = t("buying.confirmPrompt", userLang, {
                itemName: item.name,
                gamertag: session.gamertag!,
                formattedPrice: formatRupiah(res.finalPrice),
                voucherLine: "\n" + t("buying.invoiceVoucherLine", userLang, {
                    code: res.code,
                    formattedDiscount: formatRupiah(res.discountNominal)
                })
            });

            if (ctx.sendButtons) {
                const sent = await ctx.sendButtons(
                    remoteJid,
                    buildOrderConfirmationButtons(summaryText, true, userLang)
                );
                const msgId = sent?.key?.id || sent?.id;
                if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
            } else {
                let msg = t("voucherApplied", userLang, {
                    code: res.code,
                    discountNominal: res.discountNominal,
                    finalPrice: res.finalPrice
                });
                msg += t("buying.voucherProceedHint", userLang);
                await ctx.sendText(remoteJid, msg);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            let errText = "";
            if (errMsg.includes("EXHAUSTED") || errMsg.toLowerCase().includes("kuota")) {
                errText = t("voucherExhausted", userLang, { code });
            } else if (errMsg.includes("EXPIRED") || errMsg.toLowerCase().includes("kedaluwarsa")) {
                errText = t("voucherExpired", userLang, { code });
            } else {
                errText = t("voucherInvalid", userLang, { code });
            }

            if (ctx.sendButtons) {
                const sent = await ctx.sendButtons(
                    remoteJid,
                    buildVoucherPromptButtons(errText, userLang)
                );
                const msgId = sent?.key?.id || sent?.id;
                if (msgId) ctx.state.setPromptMessageId(remoteJid, String(msgId));
            } else {
                await ctx.sendText(remoteJid, errText);
            }
        }
        return true;
    }

    return false;
}
