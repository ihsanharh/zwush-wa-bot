import type { BotContext } from "./message";
import type { Language } from "../i18n";
import { t } from "../i18n";
import { clearPosterCache } from "../poster";
import {
    buildAdminVouchersOverview,
    buildAdminVoucherListMessage,
    buildAdminVoucherDetailCard,
    buildAdminVoucherEditMenu,
    buildAdminVoucherDeleteConfirm,
    buildQuickReplyPayload
} from "../utils/interactiveBuilders";

async function applyGlobalDiscount(
    remoteJid: string,
    percent: number,
    effectiveSender: string,
    userLang: Language,
    ctx: BotContext,
    mentions?: string[]
): Promise<void> {
    try {
        const updatedPercent = await ctx.client.setGlobalDiscount(percent);
        clearPosterCache();
        ctx.state.clearAdminVoucher(effectiveSender);

        const successText = t("adminVoucher.globalDiscountSuccess", userLang, { percent: updatedPercent });
        const buttons = buildQuickReplyPayload(successText, [
            { id: "admin_panel_vouchers", text: t("adminVoucher.btnMenu", userLang) },
            { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, successText, mentions);
        }
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await ctx.sendText(remoteJid, t("adminVoucher.globalDiscountFailed", userLang, { error: errMsg }), mentions);
    }
}

/**
 * Handles interactive button clicks related to Voucher Management
 */
export async function handleAdminVoucherAction(
    remoteJid: string,
    actionId: string,
    effectiveSender: string,
    isGroup: boolean,
    userLang: Language,
    ctx: BotContext
): Promise<boolean> {
    const mentions = isGroup && effectiveSender ? [effectiveSender] : undefined;

    // 1. Overview menu
    if (actionId === "admin_panel_vouchers") {
        try {
            const res = await ctx.client.getBalance(false);
            const vouchers = typeof ctx.client.listVouchers === "function"
                ? await ctx.client.listVouchers().catch(() => [])
                : [];
            const s = res.summary;
            const overview = buildAdminVouchersOverview(
                s.discountPercent,
                s.activeVouchers,
                vouchers.length,
                userLang
            );
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, overview);
            } else {
                await ctx.sendText(remoteJid, overview.text, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminVoucher.loadFailed", userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    // 2. List Vouchers
    if (actionId === "btn_admin_voucher_list") {
        try {
            const vouchers = await ctx.client.listVouchers();
            ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_ACTION_CODE");
            const listMsg = buildAdminVoucherListMessage(vouchers, userLang);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, listMsg);
            } else {
                await ctx.sendText(remoteJid, listMsg.text, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminVoucher.listLoadFailed", userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    // 3. Start Create Voucher (Step 1)
    if (actionId === "btn_admin_voucher_create") {
        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_CODE", {});
        const promptText = t("adminVoucher.createStep1Prompt", userLang);
        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, promptText, mentions);
        }
        return true;
    }

    // 4. Cancel active voucher flow
    if (actionId === "btn_admin_voucher_cancel") {
        ctx.state.clearAdminVoucher(effectiveSender);
        const cancelText = t("adminVoucher.cancelled", userLang);
        const menuPayload = buildQuickReplyPayload(cancelText, [
            { id: "admin_panel_vouchers", text: t("adminVoucher.btnMenu", userLang) },
            { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, menuPayload);
        } else {
            await ctx.sendText(remoteJid, cancelText, mentions);
        }
        return true;
    }

    // 5. Select discount type (Step 2)
    if (actionId === "btn_admin_voucher_type_percent" || actionId === "btn_admin_voucher_type_flat") {
        const type = actionId === "btn_admin_voucher_type_percent" ? "PERCENT" : "FLAT";
        const draft = ctx.state.getAdminVoucherDraft(effectiveSender);
        const code = draft?.code || "VOUCHER";
        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_VALUE", { discountType: type });

        const promptText = type === "PERCENT"
            ? t("adminVoucher.createStep3PercentPrompt", userLang, { code })
            : t("adminVoucher.createStep3FlatPrompt", userLang, { code });

        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, promptText, mentions);
        }
        return true;
    }

    // 6. Toggle active/inactive status
    if (actionId.startsWith("btn_admin_voucher_toggle_")) {
        const code = actionId.replace("btn_admin_voucher_toggle_", "").trim().toUpperCase();
        try {
            const vouchers = await ctx.client.listVouchers();
            const target = vouchers.find((v) => v.code.toUpperCase() === code);
            if (!target) {
                await ctx.sendText(remoteJid, t("adminVoucher.notFound", userLang, { code }), mentions);
                return true;
            }
            const updated = await ctx.client.updateVoucher(code, { active: !target.active });
            const statusMsg = updated.active
                ? t("adminVoucher.statusActiveBold", userLang)
                : t("adminVoucher.statusInactiveBold", userLang);
            await ctx.sendText(
                remoteJid,
                t("adminVoucher.toggledSuccess", userLang, { code, status: statusMsg }),
                mentions
            );

            const detail = buildAdminVoucherDetailCard(updated, userLang);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, detail);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminVoucher.toggleFailed", userLang, { code, error: errMsg }), mentions);
        }
        return true;
    }

    // 7. Edit Menu (Choice: Discount vs Quota)
    if (actionId.startsWith("btn_admin_voucher_edit_menu_")) {
        const code = actionId.replace("btn_admin_voucher_edit_menu_", "").trim().toUpperCase();
        const editMenu = buildAdminVoucherEditMenu(code, userLang);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, editMenu);
        } else {
            await ctx.sendText(remoteJid, editMenu.text, mentions);
        }
        return true;
    }

    // 8. Edit Discount Value Prompt
    if (actionId.startsWith("btn_admin_voucher_edit_val_")) {
        const code = actionId.replace("btn_admin_voucher_edit_val_", "").trim().toUpperCase();
        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_EDIT_DISCOUNT", { targetCode: code });
        const text = t("adminVoucher.editDiscountPrompt", userLang, { code });
        const buttons = buildQuickReplyPayload(text, [
            { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, text, mentions);
        }
        return true;
    }

    // 9. Edit Quota Prompt
    if (actionId.startsWith("btn_admin_voucher_edit_max_")) {
        const code = actionId.replace("btn_admin_voucher_edit_max_", "").trim().toUpperCase();
        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_EDIT_MAX_USES", { targetCode: code });
        const text = t("adminVoucher.editQuotaPrompt", userLang, { code });
        const buttons = buildQuickReplyPayload(text, [
            { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, text, mentions);
        }
        return true;
    }

    // 10. Delete Confirmation
    if (actionId.startsWith("btn_admin_voucher_del_confirm_")) {
        const code = actionId.replace("btn_admin_voucher_del_confirm_", "").trim().toUpperCase();
        const confirmMsg = buildAdminVoucherDeleteConfirm(code, userLang);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, confirmMsg);
        } else {
            await ctx.sendText(remoteJid, confirmMsg.text, mentions);
        }
        return true;
    }

    // 11. Execute Permanent Hard Delete
    if (actionId.startsWith("btn_admin_voucher_del_exec_")) {
        const code = actionId.replace("btn_admin_voucher_del_exec_", "").trim().toUpperCase();
        try {
            await ctx.client.deleteVoucher(code);
            const text = t("adminVoucher.deleteSuccess", userLang, { code });
            const buttons = buildQuickReplyPayload(text, [
                { id: "btn_admin_voucher_list", text: t("adminVoucher.btnList", userLang) },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, text, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminVoucher.deleteFailed", userLang, { code, error: errMsg }), mentions);
        }
        return true;
    }

    // 12. Global Store Discount Configuration Prompt
    if (actionId === "admin_panel_discount" || actionId === "btn_admin_voucher_global_discount") {
        let currentPercent = 0;
        try {
            const res = await ctx.client.getBalance(false);
            if (typeof res?.summary?.discountPercent === "number") {
                currentPercent = res.summary.discountPercent;
            }
        } catch {
            // fallback to 0 when balance summary is unavailable
        }
        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_GLOBAL_DISCOUNT", {});
        const promptText = t("adminVoucher.globalDiscountPrompt", userLang, { currentPercent });
        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_global_discount_0", text: t("adminVoucher.btnGlobalDiscountOff", userLang) },
            { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, promptText, mentions);
        }
        return true;
    }

    // 13. Quick Button: Disable Global Discount (0%)
    if (actionId === "btn_admin_voucher_global_discount_0") {
        await applyGlobalDiscount(remoteJid, 0, effectiveSender, userLang, ctx, mentions);
        return true;
    }

    return false;
}

/**
 * Handles conversational text inputs during Voucher Wizard & Edit steps
 */
export async function handleAdminVoucherTextInput(
    remoteJid: string,
    rawText: string,
    effectiveSender: string,
    isGroup: boolean,
    userLang: Language,
    ctx: BotContext
): Promise<boolean> {
    const text = rawText.trim();
    const adminStep = ctx.state.getAdminVoucherStep
        ? ctx.state.getAdminVoucherStep(effectiveSender)
        : ctx.state.getSession(effectiveSender).step;
    const mentions = isGroup && effectiveSender ? [effectiveSender] : undefined;

    // Check cancellation keyword
    if (text.toLowerCase() === "batal" || text.toLowerCase() === "cancel") {
        ctx.state.clearAdminVoucher(effectiveSender);
        const cancelText = t("adminVoucher.cancelled", userLang);
        const buttons = buildQuickReplyPayload(cancelText, [
            { id: "admin_panel_vouchers", text: t("adminVoucher.btnMenu", userLang) },
            { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, cancelText, mentions);
        }
        return true;
    }

    // Step 1: Input Code
    if (adminStep === "ADMIN_AWAITING_VOUCHER_CODE") {
        const code = text.toUpperCase();
        if (!/^[A-Z0-9_-]{3,20}$/.test(code)) {
            const warnText = t("adminVoucher.invalidCodeFormat", userLang);
            const buttons = buildQuickReplyPayload(warnText, [
                { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, warnText, mentions);
            }
            return true;
        }

        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_TYPE", { code });
        const promptText = t("adminVoucher.createStep2Prompt", userLang, { code });
        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_type_percent", text: t("adminVoucher.btnTypePercent", userLang) },
            { id: "btn_admin_voucher_type_flat", text: t("adminVoucher.btnTypeFlat", userLang) },
            { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, promptText, mentions);
        }
        return true;
    }

    // Step 2: Input Type via text inside active interactive wizard
    if (adminStep === "ADMIN_AWAITING_VOUCHER_TYPE") {
        const lower = text.toLowerCase();
        let chosenType: "PERCENT" | "FLAT" | null = null;
        if (lower === "1" || lower.includes("persen") || lower.includes("percent") || lower.includes("%")) {
            chosenType = "PERCENT";
        } else if (lower === "2" || lower.includes("rupiah") || lower.includes("rp") || lower.includes("flat")) {
            chosenType = "FLAT";
        }

        if (!chosenType) {
            const promptText = t("adminVoucher.invalidTypeSelection", userLang);
            const buttons = buildQuickReplyPayload(promptText, [
                { id: "btn_admin_voucher_type_percent", text: t("adminVoucher.btnTypePercent", userLang) },
                { id: "btn_admin_voucher_type_flat", text: t("adminVoucher.btnTypeFlat", userLang) },
                { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, promptText, mentions);
            }
            return true;
        }

        const draft = ctx.state.getAdminVoucherDraft(effectiveSender);
        const code = draft?.code || "VOUCHER";
        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_VALUE", { discountType: chosenType });

        const promptText = chosenType === "PERCENT"
            ? t("adminVoucher.createStep3PercentPrompt", userLang, { code })
            : t("adminVoucher.createStep3FlatPrompt", userLang, { code });

        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, promptText, mentions);
        }
        return true;
    }

    // Step 3: Input Discount Value
    if (adminStep === "ADMIN_AWAITING_VOUCHER_VALUE") {
        const num = parseInt(text.replace(/[^0-9]/g, ""), 10);
        const draft = ctx.state.getAdminVoucherDraft(effectiveSender);
        const isPercent = draft?.discountType === "PERCENT";

        if (isNaN(num) || (isPercent && (num < 1 || num > 90)) || (!isPercent && num < 1000)) {
            const warnText = isPercent
                ? t("adminVoucher.invalidPercentValue", userLang)
                : t("adminVoucher.invalidFlatValue", userLang);
            const buttons = buildQuickReplyPayload(warnText, [
                { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, warnText, mentions);
            }
            return true;
        }

        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_MAX_USES", { discountValue: num });
        const promptText = t("adminVoucher.createStep4Prompt", userLang, { code: draft?.code || "VOUCHER" });
        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, promptText, mentions);
        }
        return true;
    }

    // Step 4: Input Max Uses & Create Voucher
    if (adminStep === "ADMIN_AWAITING_VOUCHER_MAX_USES") {
        const quota = parseInt(text.replace(/[^0-9]/g, ""), 10);
        if (isNaN(quota) || quota < 0) {
            const warnText = t("adminVoucher.invalidQuotaValue", userLang);
            const buttons = buildQuickReplyPayload(warnText, [
                { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, warnText, mentions);
            }
            return true;
        }

        const draft = ctx.state.getAdminVoucherDraft(effectiveSender);
        const maxUses = quota === 0 ? null : quota;

        try {
            const created = await ctx.client.createVoucher({
                code: draft!.code!,
                discountType: draft!.discountType!,
                discountValue: draft!.discountValue!,
                maxUses
            });

            ctx.state.clearAdminVoucher(effectiveSender);

            const discountStr = created.discountType === "PERCENT"
                ? `${created.discountValue}%`
                : `Rp ${created.discountValue.toLocaleString("id-ID")}`;
            const maxUsesStr = created.maxUses !== null
                ? t("adminVoucher.usesSuffixFull", userLang, { count: created.maxUses })
                : t("adminVoucher.unlimited", userLang);

            const successText = t("adminVoucher.createSuccess", userLang, {
                code: created.code,
                discountStr,
                maxUsesStr
            });

            const buttons = buildQuickReplyPayload(successText, [
                { id: "btn_admin_voucher_list", text: t("adminVoucher.btnList", userLang) },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, successText, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminVoucher.createFailed", userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    // List Action Select: Admin types voucher code to inspect/manage
    if (adminStep === "ADMIN_AWAITING_VOUCHER_ACTION_CODE") {
        return await showAdminVoucherDetail(remoteJid, text, effectiveSender, isGroup, userLang, ctx);
    }

    // Edit Discount Value execution
    if (adminStep === "ADMIN_AWAITING_VOUCHER_EDIT_DISCOUNT") {
        const num = parseInt(text.replace(/[^0-9]/g, ""), 10);
        const draft = ctx.state.getAdminVoucherDraft(effectiveSender);
        const code = draft?.targetCode || "";

        if (isNaN(num) || num <= 0) {
            await ctx.sendText(remoteJid, t("adminVoucher.invalidEditDiscount", userLang), mentions);
            return true;
        }

        try {
            const updated = await ctx.client.updateVoucher(code, { discountValue: num });
            ctx.state.clearAdminVoucher(effectiveSender);

            const discountStr = updated.discountType === "PERCENT"
                ? `${updated.discountValue}%`
                : `Rp ${updated.discountValue.toLocaleString("id-ID")}`;

            const successText = t("adminVoucher.editDiscountSuccess", userLang, { code, discountStr });
            const buttons = buildQuickReplyPayload(successText, [
                { id: "btn_admin_voucher_list", text: t("adminVoucher.btnList", userLang) },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, successText, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(
                remoteJid,
                t("adminVoucher.editDiscountFailed", userLang, { code, error: errMsg }),
                mentions
            );
        }
        return true;
    }

    // Edit Quota execution
    if (adminStep === "ADMIN_AWAITING_VOUCHER_EDIT_MAX_USES") {
        const quota = parseInt(text.replace(/[^0-9]/g, ""), 10);
        const draft = ctx.state.getAdminVoucherDraft(effectiveSender);
        const code = draft?.targetCode || "";

        if (isNaN(quota) || quota < 0) {
            await ctx.sendText(remoteJid, t("adminVoucher.invalidEditQuota", userLang), mentions);
            return true;
        }

        try {
            const maxUses = quota === 0 ? null : quota;
            const updated = await ctx.client.updateVoucher(code, { maxUses });
            ctx.state.clearAdminVoucher(effectiveSender);

            const maxUsesStr = updated.maxUses !== null
                ? t("adminVoucher.usesSuffix", userLang, { count: updated.maxUses })
                : t("adminVoucher.unlimited", userLang);
            const successText = t("adminVoucher.editQuotaSuccess", userLang, { code, maxUsesStr });
            const buttons = buildQuickReplyPayload(successText, [
                { id: "btn_admin_voucher_list", text: t("adminVoucher.btnList", userLang) },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, successText, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(
                remoteJid,
                t("adminVoucher.editQuotaFailed", userLang, { code, error: errMsg }),
                mentions
            );
        }
        return true;
    }

    // Global Store Discount execution
    if (adminStep === "ADMIN_AWAITING_VOUCHER_GLOBAL_DISCOUNT") {
        const cleaned = text.trim();
        const match = /^(\d+)%?$/.exec(cleaned);
        const percent = match ? parseInt(match[1]!, 10) : NaN;

        if (isNaN(percent) || percent < 0 || percent > 90) {
            const warnText = t("adminVoucher.invalidGlobalDiscountValue", userLang);
            const buttons = buildQuickReplyPayload(warnText, [
                { id: "btn_admin_voucher_cancel", text: t("adminVoucher.btnCancel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, warnText, mentions);
            }
            return true;
        }

        await applyGlobalDiscount(remoteJid, percent, effectiveSender, userLang, ctx, mentions);
        return true;
    }

    return false;
}

/**
 * Directly looks up a voucher code and displays its detail card with action buttons
 */
export async function showAdminVoucherDetail(
    remoteJid: string,
    queryCode: string,
    effectiveSender: string,
    isGroup: boolean,
    userLang: Language,
    ctx: BotContext
): Promise<boolean> {
    const mentions = isGroup && effectiveSender ? [effectiveSender] : undefined;
    const cleanCode = queryCode.trim().toUpperCase();
    try {
        const vouchers = await ctx.client.listVouchers();
        const target = vouchers.find((v) => v.code.toUpperCase() === cleanCode);
        if (!target) {
            await ctx.sendText(
                remoteJid,
                t("adminVoucher.notFoundWithHint", userLang, { code: cleanCode }),
                mentions
            );
            return true;
        }

        ctx.state.clearAdminVoucher(effectiveSender);
        const detail = buildAdminVoucherDetailCard(target, userLang);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, detail);
        } else {
            await ctx.sendText(remoteJid, detail.text, mentions);
        }
        return true;
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await ctx.sendText(remoteJid, t("adminVoucher.searchFailed", userLang, { error: errMsg }), mentions);
        return true;
    }
}
