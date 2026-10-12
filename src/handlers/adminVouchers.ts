import type { BotContext } from "./message";
import type { Language } from "../i18n";
import { t } from "../i18n";
import {
    buildAdminVouchersOverview,
    buildAdminVoucherListMessage,
    buildAdminVoucherDetailCard,
    buildAdminVoucherEditMenu,
    buildAdminVoucherDeleteConfirm,
    buildQuickReplyPayload
} from "../utils/interactiveBuilders";

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
            await ctx.sendText(remoteJid, `❌ Gagal memuat data voucher: ${errMsg}`, mentions);
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
            await ctx.sendText(remoteJid, `❌ Gagal memuat daftar voucher: ${errMsg}`, mentions);
        }
        return true;
    }

    // 3. Start Create Voucher (Step 1)
    if (actionId === "btn_admin_voucher_create") {
        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_CODE", {});
        const promptText = `🏷️ *BUAT VOUCHER BARU (1/4)*\n\n` +
            `Silakan ketik *Kode Voucher* yang ingin dibuat\n` +
            `(gunakan huruf/angka tanpa spasi, contoh: *HEMAT10*):`;
        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
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
        const cancelText = `❌ Proses voucher dibatalkan.`;
        const menuPayload = buildQuickReplyPayload(cancelText, [
            { id: "admin_panel_vouchers", text: "🎟️ Menu Voucher" },
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
            ? `🏷️ *BUAT VOUCHER: ${code} (3/4)*\n\nMasukkan besar persentase diskon (1 - 90, contoh: *10* untuk 10%):`
            : `🏷️ *BUAT VOUCHER: ${code} (3/4)*\n\nMasukkan besar nominal potongan (minimal 1000, contoh: *5000* untuk Rp 5.000):`;

        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
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
                await ctx.sendText(remoteJid, `⚠️ Voucher *${code}* tidak ditemukan.`, mentions);
                return true;
            }
            const updated = await ctx.client.updateVoucher(code, { active: !target.active });
            const statusMsg = updated.active ? "🟢 *Aktif*" : "🔴 *Nonaktif*";
            await ctx.sendText(remoteJid, `✅ Status voucher *${code}* berhasil diubah menjadi ${statusMsg}!`, mentions);

            const detail = buildAdminVoucherDetailCard(updated, userLang);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, detail);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal mengubah status voucher *${code}*: ${errMsg}`, mentions);
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
        const text = `✏️ *EDIT NILAI DISKON: ${code}*\n\n` +
            `Silakan ketik nilai diskon baru di chat ini\n` +
            `(contoh: *15* untuk 15%, atau *10000* untuk Rp 10.000):`;
        const buttons = buildQuickReplyPayload(text, [
            { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
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
        const text = `✏️ *EDIT KUOTA: ${code}*\n\n` +
            `Silakan ketik kuota maksimal penggunaan baru di chat ini\n` +
            `(contoh: *100*, atau ketik *0* jika ingin tanpa batas kuota):`;
        const buttons = buildQuickReplyPayload(text, [
            { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
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
            const text = `✅ Voucher *${code}* telah *berhasil dihapus secara permanen* dari database!`;
            const buttons = buildQuickReplyPayload(text, [
                { id: "btn_admin_voucher_list", text: "📋 List Voucher" },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, text, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal menghapus voucher *${code}*: ${errMsg}`, mentions);
        }
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
        const cancelText = `❌ Proses voucher dibatalkan.`;
        const buttons = buildQuickReplyPayload(cancelText, [
            { id: "admin_panel_vouchers", text: "🎟️ Menu Voucher" },
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
            const warnText = `⚠️ Format kode voucher tidak valid.\n\n` +
                `Gunakan huruf dan angka saja (3-20 karakter, contoh: *HEMAT10*).\n` +
                `Silakan ketik kembali:`;
            const buttons = buildQuickReplyPayload(warnText, [
                { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, warnText, mentions);
            }
            return true;
        }

        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_TYPE", { code });
        const promptText = `🏷️ *BUAT VOUCHER: ${code} (2/4)*\n\n` +
            `Pilih tipe potongan diskon:`;
        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_type_percent", text: "1. Persentase (%)" },
            { id: "btn_admin_voucher_type_flat", text: "2. Nominal Rupiah" },
            { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
        ]);
        if (ctx.sendButtons) {
            await ctx.sendButtons(remoteJid, buttons);
        } else {
            await ctx.sendText(remoteJid, promptText, mentions);
        }
        return true;
    }

    // Step 2: Input Type via text
    if (adminStep === "ADMIN_AWAITING_VOUCHER_TYPE") {
        const lower = text.toLowerCase();
        let chosenType: "PERCENT" | "FLAT" | null = null;
        if (lower === "1" || lower.includes("persen") || lower.includes("%")) {
            chosenType = "PERCENT";
        } else if (lower === "2" || lower.includes("rupiah") || lower.includes("rp") || lower.includes("flat")) {
            chosenType = "FLAT";
        }

        if (!chosenType) {
            const promptText = `⚠️ Pilihan tipe tidak valid. Silakan pilih tombol di bawah:`;
            const buttons = buildQuickReplyPayload(promptText, [
                { id: "btn_admin_voucher_type_percent", text: "1. Persentase (%)" },
                { id: "btn_admin_voucher_type_flat", text: "2. Nominal Rupiah" },
                { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
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
            ? `🏷️ *BUAT VOUCHER: ${code} (3/4)*\n\nMasukkan besar persentase diskon (1 - 90, contoh: *10* untuk 10%):`
            : `🏷️ *BUAT VOUCHER: ${code} (3/4)*\n\nMasukkan besar nominal potongan (minimal 1000, contoh: *5000* untuk Rp 5.000):`;

        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
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
                ? `⚠️ Persentase diskon harus angka antara 1 sampai 90. Silakan ketik kembali (contoh: *10*):`
                : `⚠️ Nominal diskon minimal Rp 1.000. Silakan ketik kembali (contoh: *5000*):`;
            const buttons = buildQuickReplyPayload(warnText, [
                { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, warnText, mentions);
            }
            return true;
        }

        ctx.state.setAdminVoucherStep(effectiveSender, "ADMIN_AWAITING_VOUCHER_MAX_USES", { discountValue: num });
        const promptText = `🏷️ *BUAT VOUCHER: ${draft?.code} (4/4)*\n\n` +
            `Berapa kuota maksimal penggunaan voucher ini?\n` +
            `(Ketik angka kuota, contoh: *50*, atau ketik *0* jika ingin tanpa batas kuota):`;
        const buttons = buildQuickReplyPayload(promptText, [
            { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
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
            const warnText = `⚠️ Mohon masukkan angka yang valid (contoh: *50*, atau ketik *0* untuk tanpa batas kuota):`;
            const buttons = buildQuickReplyPayload(warnText, [
                { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
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
            const maxUsesStr = created.maxUses !== null ? `${created.maxUses} kali penggunaan` : "Tanpa Batas";

            const successText = `🎉 *VOUCHER BERHASIL DIBUAT!*\n\n` +
                `• Kode: *${created.code}*\n` +
                `• Diskon: *${discountStr}*\n` +
                `• Kuota: *${maxUsesStr}*\n` +
                `• Status: *🟢 Aktif*\n\n` +
                `Voucher sudah tersimpan di database dan siap digunakan pembeli!`;

            const buttons = buildQuickReplyPayload(successText, [
                { id: "btn_admin_voucher_list", text: "📋 List Voucher" },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, successText, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal membuat voucher: ${errMsg}`, mentions);
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
        const code = draft?.targetCode;

        if (isNaN(num) || num <= 0) {
            await ctx.sendText(remoteJid, `⚠️ Nilai diskon harus berupa angka lebih dari 0. Silakan ketik kembali:`, mentions);
            return true;
        }

        try {
            const updated = await ctx.client.updateVoucher(code!, { discountValue: num });
            ctx.state.clearAdminVoucher(effectiveSender);

            const discountStr = updated.discountType === "PERCENT"
                ? `${updated.discountValue}%`
                : `Rp ${updated.discountValue.toLocaleString("id-ID")}`;

            const successText = `✅ Nilai diskon voucher *${code}* berhasil diubah menjadi *${discountStr}*!`;
            const buttons = buildQuickReplyPayload(successText, [
                { id: "btn_admin_voucher_list", text: "📋 List Voucher" },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, successText, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal mengubah diskon voucher *${code}*: ${errMsg}`, mentions);
        }
        return true;
    }

    // Edit Quota execution
    if (adminStep === "ADMIN_AWAITING_VOUCHER_EDIT_MAX_USES") {
        const quota = parseInt(text.replace(/[^0-9]/g, ""), 10);
        const draft = ctx.state.getAdminVoucherDraft(effectiveSender);
        const code = draft?.targetCode;

        if (isNaN(quota) || quota < 0) {
            await ctx.sendText(remoteJid, `⚠️ Kuota harus berupa angka (contoh: *100*, atau *0* jika tanpa batas):`, mentions);
            return true;
        }

        try {
            const maxUses = quota === 0 ? null : quota;
            const updated = await ctx.client.updateVoucher(code!, { maxUses });
            ctx.state.clearAdminVoucher(effectiveSender);

            const maxUsesStr = updated.maxUses !== null ? `${updated.maxUses} kali` : "Tanpa Batas";
            const successText = `✅ Kuota maksimal voucher *${code}* berhasil diubah menjadi *${maxUsesStr}*!`;
            const buttons = buildQuickReplyPayload(successText, [
                { id: "btn_admin_voucher_list", text: "📋 List Voucher" },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]);
            if (ctx.sendButtons) {
                await ctx.sendButtons(remoteJid, buttons);
            } else {
                await ctx.sendText(remoteJid, successText, mentions);
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal mengubah kuota voucher *${code}*: ${errMsg}`, mentions);
        }
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
                `⚠️ Voucher *${cleanCode}* tidak ditemukan. Silakan periksa kembali kode voucher atau klik [📋 List Voucher].`,
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
        await ctx.sendText(remoteJid, `❌ Gagal mencari voucher: ${errMsg}`, mentions);
        return true;
    }
}

