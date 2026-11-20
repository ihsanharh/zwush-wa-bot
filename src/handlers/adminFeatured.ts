import type { BotContext } from "./message";
import type { Language } from "../i18n";
import { formatRupiah, t } from "../i18n";
import type { CatalogItem, FeaturedBundleConfig, IncomingImageAttachment } from "../types";
import type { AdminFeaturedDraft } from "../state";
import {
    buildAdminFeaturedOverviewCard,
    buildFeaturedBundleCard,
    buildQuickReplyPayload
} from "../utils/interactiveBuilders";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGE_LENGTH = 1000;
const ALLOWED_IMAGE_MIMETYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type SupportedFeaturedMimetype = "image/jpeg" | "image/png" | "image/webp";

function normalizeFeaturedMimetype(mimetype: string): SupportedFeaturedMimetype | null {
    const clean = mimetype.split(";")[0]?.trim().toLowerCase() || "";
    if (clean === "image/jpg") return "image/jpeg";
    if (ALLOWED_IMAGE_MIMETYPES.has(clean)) {
        return clean as SupportedFeaturedMimetype;
    }
    return null;
}

function truncateButtonLabel(label: string, maxLen = 20): string {
    if (label.length <= maxLen) return label;
    return `${label.slice(0, maxLen - 3)}...`;
}

async function sendButtonsOrFallback(
    ctx: BotContext,
    remoteJid: string,
    payload: {
        interactiveMessage?: any;
        text: string;
        buttons?: Array<{ id: string; text: string }>;
        headerImage?: Buffer;
        headerImageMimetype?: string;
    },
    mentions?: string[]
): Promise<void> {
    if (ctx.sendButtons) {
        await ctx.sendButtons(remoteJid, payload);
    } else if (payload.headerImage) {
        await ctx.sendImage(remoteJid, payload.headerImage, payload.text);
    } else {
        await ctx.sendText(remoteJid, payload.text, mentions);
    }
}

async function sendStep2MessagePrompt(
    remoteJid: string,
    effectiveSender: string,
    draft: Partial<AdminFeaturedDraft>,
    userLang: Language,
    ctx: BotContext,
    mentions?: string[]
): Promise<void> {
    ctx.state.setAdminFeaturedStep?.(effectiveSender, "ADMIN_AWAITING_FEATURED_MESSAGE", draft, remoteJid);
    const updatedDraft = ctx.state.getAdminFeaturedDraft?.(effectiveSender, remoteJid);
    const promptText = t("adminFeatured.step2MessagePrompt", userLang);
    const buttons: Array<{ id: string; text: string }> = [];
    if (updatedDraft?.isEditing && updatedDraft.existingMessage) {
        buttons.push({ id: "btn_admin_featured_keep_message", text: t("adminFeatured.btnKeepOldMessage", userLang) });
    }
    buttons.push({ id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) });
    await sendButtonsOrFallback(ctx, remoteJid, buildQuickReplyPayload(promptText, buttons), mentions);
}

async function sendStep3ItemPrompt(
    remoteJid: string,
    effectiveSender: string,
    draft: Partial<AdminFeaturedDraft>,
    userLang: Language,
    ctx: BotContext,
    mentions?: string[],
    customPromptText?: string
): Promise<void> {
    ctx.state.setAdminFeaturedStep?.(effectiveSender, "ADMIN_AWAITING_FEATURED_ITEM", draft, remoteJid);
    const updatedDraft = ctx.state.getAdminFeaturedDraft?.(effectiveSender, remoteJid);
    const promptText = customPromptText || t("adminFeatured.step3ItemPrompt", userLang);
    const buttons: Array<{ id: string; text: string }> = [];
    if (updatedDraft?.isEditing && updatedDraft.existingItemName) {
        buttons.push({ id: "btn_admin_featured_keep_item", text: t("adminFeatured.btnKeepOldItem", userLang) });
    }
    buttons.push({ id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) });
    await sendButtonsOrFallback(ctx, remoteJid, buildQuickReplyPayload(promptText, buttons), mentions);
}

async function sendStep4PreviewAndConfirm(
    remoteJid: string,
    effectiveSender: string,
    selectedItem: CatalogItem,
    userLang: Language,
    ctx: BotContext,
    mentions?: string[]
): Promise<void> {
    ctx.state.setAdminFeaturedStep?.(
        effectiveSender,
        "ADMIN_AWAITING_FEATURED_CONFIRM",
        {
            itemName: selectedItem.name,
            itemId: selectedItem.id,
            candidateItems: undefined
        },
        remoteJid
    );

    const draft = ctx.state.getAdminFeaturedDraft?.(effectiveSender, remoteJid);
    const previewBuffer = draft?.imageBase64
        ? Buffer.from(draft.imageBase64, "base64")
        : draft?.existingImageBuffer;
    const previewMimetype = draft?.imageMimetype || draft?.existingImageMimetype || "image/jpeg";

    const previewConfig: FeaturedBundleConfig = {
        configured: true,
        enabled: true,
        available: true,
        unavailableReason: null,
        itemName: selectedItem.name,
        customMessage: draft?.customMessage || draft?.existingMessage || "",
        hasImage: Boolean(previewBuffer),
        imageMimetype: previewMimetype,
        updatedAt: new Date().toISOString(),
        item: selectedItem
    };

    const previewCard = buildFeaturedBundleCard(
        previewConfig,
        userLang,
        "IDR",
        previewBuffer,
        previewMimetype,
        { isPreview: true }
    );
    await sendButtonsOrFallback(ctx, remoteJid, previewCard, mentions);

    const confirmText = t("adminFeatured.step4ConfirmPrompt", userLang, {
        itemName: selectedItem.name,
        price: formatRupiah(selectedItem.rupiahPrice),
        discountPercent: selectedItem.discountPercent ?? 0
    });
    const confirmPayload = buildQuickReplyPayload(confirmText, [
        { id: "btn_admin_featured_save_on", text: t("adminFeatured.btnSaveEnable", userLang) },
        { id: "btn_admin_featured_save_off", text: t("adminFeatured.btnSaveDisabled", userLang) },
        { id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) }
    ]);
    await sendButtonsOrFallback(ctx, remoteJid, confirmPayload, mentions);
}

/**
 * Handles interactive admin actions for Featured Bundle management.
 */
export async function handleAdminFeaturedAction(
    remoteJid: string,
    actionId: string,
    effectiveSender: string,
    isGroup: boolean,
    userLang: Language,
    ctx: BotContext
): Promise<boolean> {
    const mentions = isGroup && effectiveSender ? [effectiveSender] : undefined;

    if (actionId === "btn_admin_featured_noop") {
        return true;
    }

    // 1. Overview card
    if (actionId === "admin_panel_featured") {
        try {
            const featured = await ctx.client.getFeaturedBundle("IDR", true);
            const card = buildAdminFeaturedOverviewCard(featured, userLang);
            await sendButtonsOrFallback(ctx, remoteJid, card, mentions);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminFeatured.loadFailed", userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    // 2. Toggle ON / OFF
    if (actionId === "btn_admin_featured_toggle_on" || actionId === "btn_admin_featured_toggle_off") {
        const enable = actionId === "btn_admin_featured_toggle_on";
        try {
            await ctx.client.toggleFeaturedBundle(enable);
            const msg = enable
                ? t("adminFeatured.toggleOnSuccess", userLang)
                : t("adminFeatured.toggleOffSuccess", userLang);
            const buttons = buildQuickReplyPayload(msg, [
                { id: "admin_panel_featured", text: t("adminFeatured.btnMenu", userLang) },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]);
            await sendButtonsOrFallback(ctx, remoteJid, buttons, mentions);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminFeatured.toggleFailed", userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    // 3. Preview currently saved Featured Bundle
    if (actionId === "btn_admin_featured_preview") {
        try {
            const featured = await ctx.client.getFeaturedBundle("IDR", true);
            if (!featured.configured || !featured.item) {
                const msg = t("adminFeatured.previewUnavailable", userLang);
                await sendButtonsOrFallback(
                    ctx,
                    remoteJid,
                    buildQuickReplyPayload(msg, [
                        { id: "admin_panel_featured", text: t("adminFeatured.btnMenu", userLang) },
                        { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
                    ]),
                    mentions
                );
                return true;
            }
            const img = featured.hasImage
                ? await ctx.client.getFeaturedBundleImage(featured.updatedAt).catch(() => null)
                : null;
            const previewCard = buildFeaturedBundleCard(
                featured,
                userLang,
                "IDR",
                img?.buffer,
                img?.mimetype || featured.imageMimetype || undefined,
                { isPreview: true }
            );
            await sendButtonsOrFallback(ctx, remoteJid, previewCard, mentions);

            const navCard = buildAdminFeaturedOverviewCard(featured, userLang);
            await sendButtonsOrFallback(ctx, remoteJid, navCard, mentions);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminFeatured.loadFailed", userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    // 4. Start Setup / Edit Wizard (Step 1)
    if (actionId === "btn_admin_featured_setup") {
        let current: FeaturedBundleConfig | null = null;
        let existingImg: { buffer: Buffer; mimetype: string } | null = null;
        try {
            current = await ctx.client.getFeaturedBundle("IDR", true);
            if (current.configured && current.hasImage) {
                existingImg = await ctx.client.getFeaturedBundleImage(current.updatedAt).catch(() => null);
            }
        } catch {
            current = null;
        }

        const isEditing = Boolean(current?.configured);
        ctx.state.clearAdminFeatured?.(effectiveSender, remoteJid);
        ctx.state.setAdminFeaturedStep?.(
            effectiveSender,
            "ADMIN_AWAITING_FEATURED_IMAGE",
            {
                isEditing,
                existingImageBuffer: existingImg?.buffer,
                existingImageMimetype: existingImg?.mimetype || current?.imageMimetype || undefined,
                existingMessage: current?.customMessage || undefined,
                existingItemName: current?.itemName || undefined
            },
            remoteJid
        );

        const canKeepOldImage = isEditing && Boolean(current?.hasImage);
        const promptText = canKeepOldImage
            ? t("adminFeatured.step1ImagePromptEdit", userLang)
            : t("adminFeatured.step1ImagePrompt", userLang);

        const buttons: Array<{ id: string; text: string }> = [];
        if (canKeepOldImage) {
            buttons.push({ id: "btn_admin_featured_keep_image", text: t("adminFeatured.btnKeepOldImage", userLang) });
        }
        buttons.push({ id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) });
        await sendButtonsOrFallback(ctx, remoteJid, buildQuickReplyPayload(promptText, buttons), mentions);
        return true;
    }

    // 5. Cancel Wizard
    if (actionId === "btn_admin_featured_cancel") {
        ctx.state.clearAdminFeatured?.(effectiveSender, remoteJid);
        const cancelMsg = t("adminFeatured.cancelled", userLang);
        await sendButtonsOrFallback(
            ctx,
            remoteJid,
            buildQuickReplyPayload(cancelMsg, [
                { id: "admin_panel_featured", text: t("adminFeatured.btnMenu", userLang) },
                { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
            ]),
            mentions
        );
        return true;
    }

    // 6. Keep Old Image (Edit Step 1 -> Step 2)
    if (actionId === "btn_admin_featured_keep_image") {
        const draft = ctx.state.getAdminFeaturedDraft?.(effectiveSender, remoteJid);
        if (!draft || !draft.isEditing) {
            return await handleAdminFeaturedAction(
                remoteJid,
                "btn_admin_featured_setup",
                effectiveSender,
                isGroup,
                userLang,
                ctx
            );
        }
        await sendStep2MessagePrompt(
            remoteJid,
            effectiveSender,
            {
                keepExistingImage: true,
                imageBase64: undefined,
                imageMimetype: undefined
            },
            userLang,
            ctx,
            mentions
        );
        return true;
    }

    // 7. Keep Old Message (Edit Step 2 -> Step 3)
    if (actionId === "btn_admin_featured_keep_message") {
        const draft = ctx.state.getAdminFeaturedDraft?.(effectiveSender, remoteJid);
        if (!draft?.existingMessage) {
            return await handleAdminFeaturedAction(
                remoteJid,
                "btn_admin_featured_setup",
                effectiveSender,
                isGroup,
                userLang,
                ctx
            );
        }
        await sendStep3ItemPrompt(
            remoteJid,
            effectiveSender,
            { customMessage: draft.existingMessage },
            userLang,
            ctx,
            mentions
        );
        return true;
    }

    // 8. Keep Old Item (Edit Step 3 -> Step 4 Preview & Confirm)
    if (actionId === "btn_admin_featured_keep_item") {
        const draft = ctx.state.getAdminFeaturedDraft?.(effectiveSender, remoteJid);
        if (!draft?.existingItemName) {
            return await handleAdminFeaturedAction(
                remoteJid,
                "btn_admin_featured_setup",
                effectiveSender,
                isGroup,
                userLang,
                ctx
            );
        }
        try {
            const catalog = await ctx.client.getCatalog("IDR");
            const activeTarget = catalog.find(
                (i) => i.active && i.name.toLowerCase() === draft.existingItemName!.toLowerCase()
            );
            if (!activeTarget) {
                await sendStep3ItemPrompt(
                    remoteJid,
                    effectiveSender,
                    {},
                    userLang,
                    ctx,
                    mentions,
                    t("adminFeatured.step3OldItemInactive", userLang, { itemName: draft.existingItemName })
                );
                return true;
            }
            await sendStep4PreviewAndConfirm(remoteJid, effectiveSender, activeTarget, userLang, ctx, mentions);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminFeatured.loadFailed", userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    // 9. Pick candidate item from 2-3 matches
    if (actionId.startsWith("btn_admin_featured_pick_")) {
        const idx = parseInt(actionId.replace("btn_admin_featured_pick_", ""), 10);
        const draft = ctx.state.getAdminFeaturedDraft?.(effectiveSender, remoteJid);
        const candidate = !Number.isNaN(idx) ? draft?.candidateItems?.[idx] : undefined;
        if (!candidate) {
            return true;
        }
        try {
            const catalog = await ctx.client.getCatalog("IDR");
            const selected = catalog.find(
                (i) => i.active && (i.id === candidate.id || i.name.toLowerCase() === candidate.name.toLowerCase())
            );
            if (!selected) {
                await sendStep3ItemPrompt(
                    remoteJid,
                    effectiveSender,
                    {},
                    userLang,
                    ctx,
                    mentions,
                    t("adminFeatured.step3OldItemInactive", userLang, { itemName: candidate.name })
                );
                return true;
            }
            await sendStep4PreviewAndConfirm(remoteJid, effectiveSender, selected, userLang, ctx, mentions);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminFeatured.loadFailed", userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    // 10. Save & Enable or Save (OFF)
    if (actionId === "btn_admin_featured_save_on" || actionId === "btn_admin_featured_save_off") {
        const enabled = actionId === "btn_admin_featured_save_on";
        const draft = ctx.state.getAdminFeaturedDraft?.(effectiveSender, remoteJid);
        if (!draft?.itemName || !draft?.customMessage || (!draft.imageBase64 && !draft.keepExistingImage)) {
            return await handleAdminFeaturedAction(
                remoteJid,
                "btn_admin_featured_setup",
                effectiveSender,
                isGroup,
                userLang,
                ctx
            );
        }

        try {
            const saved = await ctx.client.saveFeaturedBundle({
                itemName: draft.itemName,
                customMessage: draft.customMessage,
                enabled,
                ...(draft.imageBase64 && draft.imageMimetype
                    ? { imageBase64: draft.imageBase64, imageMimetype: draft.imageMimetype }
                    : {})
            });
            ctx.state.clearAdminFeatured?.(effectiveSender, remoteJid);

            const priceStr = saved.item ? formatRupiah(saved.item.rupiahPrice) : "-";
            const successText = enabled
                ? t("adminFeatured.saveSuccessOn", userLang, {
                      itemName: saved.item?.name || draft.itemName,
                      price: priceStr
                  })
                : t("adminFeatured.saveSuccessOff", userLang, {
                      itemName: saved.item?.name || draft.itemName,
                      price: priceStr
                  });

            await sendButtonsOrFallback(
                ctx,
                remoteJid,
                buildQuickReplyPayload(successText, [
                    { id: "admin_panel_featured", text: t("adminFeatured.btnMenu", userLang) },
                    { id: "btn_admin_panel", text: t("buttons.adminPanel", userLang) }
                ]),
                mentions
            );
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, t("adminFeatured.saveFailed", userLang, { error: errMsg }), mentions);
        }
        return true;
    }

    return false;
}

/**
 * Handles text/image inputs while an admin is inside the Featured Bundle setup wizard.
 */
export async function handleAdminFeaturedInput(
    remoteJid: string,
    text: string,
    effectiveSender: string,
    _isGroup: boolean,
    userLang: Language,
    ctx: BotContext,
    incomingImage?: IncomingImageAttachment
): Promise<boolean> {
    const step = ctx.state.getAdminFeaturedStep?.(effectiveSender, remoteJid);
    if (!step || !step.startsWith("ADMIN_AWAITING_FEATURED_")) {
        return false;
    }

    const mentions = _isGroup && effectiveSender ? [effectiveSender] : undefined;
    const draft = ctx.state.getAdminFeaturedDraft?.(effectiveSender, remoteJid);

    // Step 1: Expect promo image (with optional caption shortcut)
    if (step === "ADMIN_AWAITING_FEATURED_IMAGE") {
        if (!incomingImage) {
            const warnText = t("adminFeatured.step1NeedImage", userLang);
            const buttons: Array<{ id: string; text: string }> = [];
            if (draft?.isEditing && (draft.existingImageBuffer || draft.existingItemName)) {
                buttons.push({ id: "btn_admin_featured_keep_image", text: t("adminFeatured.btnKeepOldImage", userLang) });
            }
            buttons.push({ id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) });
            await sendButtonsOrFallback(ctx, remoteJid, buildQuickReplyPayload(warnText, buttons), mentions);
            return true;
        }

        const normalizedMime = normalizeFeaturedMimetype(incomingImage.mimetype);
        if (!normalizedMime) {
            const warnText = t("adminFeatured.step1InvalidType", userLang, { mimetype: incomingImage.mimetype });
            await sendButtonsOrFallback(
                ctx,
                remoteJid,
                buildQuickReplyPayload(warnText, [
                    { id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) }
                ]),
                mentions
            );
            return true;
        }

        let buffer: Buffer;
        try {
            buffer = await incomingImage.download();
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await sendButtonsOrFallback(
                ctx,
                remoteJid,
                buildQuickReplyPayload(t("adminFeatured.step1DownloadFailed", userLang, { error: errMsg }), [
                    { id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) }
                ]),
                mentions
            );
            return true;
        }

        if (!buffer || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
            await sendButtonsOrFallback(
                ctx,
                remoteJid,
                buildQuickReplyPayload(t("adminFeatured.step1TooLarge", userLang), [
                    { id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) }
                ]),
                mentions
            );
            return true;
        }

        const imagePatch: Partial<AdminFeaturedDraft> = {
            imageBase64: buffer.toString("base64"),
            imageMimetype: normalizedMime,
            keepExistingImage: false
        };

        const caption = (incomingImage.caption || text || "").trim();
        if (caption.length > 0 && caption.length <= MAX_MESSAGE_LENGTH) {
            // Caption shortcut: skip Step 2 straight to Step 3!
            await sendStep3ItemPrompt(
                remoteJid,
                effectiveSender,
                { ...imagePatch, customMessage: caption },
                userLang,
                ctx,
                mentions
            );
            return true;
        }

        if (caption.length > MAX_MESSAGE_LENGTH) {
            ctx.state.setAdminFeaturedStep?.(effectiveSender, "ADMIN_AWAITING_FEATURED_MESSAGE", imagePatch, remoteJid);
            const tooLongText = t("adminFeatured.step2MessageTooLong", userLang, { length: caption.length });
            const buttons: Array<{ id: string; text: string }> = [];
            if (draft?.isEditing && draft.existingMessage) {
                buttons.push({ id: "btn_admin_featured_keep_message", text: t("adminFeatured.btnKeepOldMessage", userLang) });
            }
            buttons.push({ id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) });
            await sendButtonsOrFallback(ctx, remoteJid, buildQuickReplyPayload(tooLongText, buttons), mentions);
            return true;
        }

        await sendStep2MessagePrompt(remoteJid, effectiveSender, imagePatch, userLang, ctx, mentions);
        return true;
    }

    // Step 2: Custom promo message
    if (step === "ADMIN_AWAITING_FEATURED_MESSAGE") {
        const msg = text.trim();
        if (!msg) {
            const emptyText = t("adminFeatured.step2EmptyMessage", userLang);
            await sendButtonsOrFallback(
                ctx,
                remoteJid,
                buildQuickReplyPayload(emptyText, [
                    { id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) }
                ]),
                mentions
            );
            return true;
        }
        if (msg.length > MAX_MESSAGE_LENGTH) {
            const tooLongText = t("adminFeatured.step2MessageTooLong", userLang, { length: msg.length });
            await sendButtonsOrFallback(
                ctx,
                remoteJid,
                buildQuickReplyPayload(tooLongText, [
                    { id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) }
                ]),
                mentions
            );
            return true;
        }

        await sendStep3ItemPrompt(
            remoteJid,
            effectiveSender,
            { customMessage: msg },
            userLang,
            ctx,
            mentions
        );
        return true;
    }

    // Step 3: Search and link active catalog item
    if (step === "ADMIN_AWAITING_FEATURED_ITEM") {
        const query = text.trim();
        if (!query) {
            await sendStep3ItemPrompt(remoteJid, effectiveSender, {}, userLang, ctx, mentions);
            return true;
        }

        const catalog = (await ctx.client.getCatalog("IDR")).filter((i) => i.active);
        const queryLower = query.toLowerCase();

        const exactMatch = catalog.find((i) => i.name.toLowerCase() === queryLower);
        if (exactMatch) {
            await sendStep4PreviewAndConfirm(remoteJid, effectiveSender, exactMatch, userLang, ctx, mentions);
            return true;
        }

        const matches = catalog.filter((i) => i.name.toLowerCase().includes(queryLower));
        if (matches.length === 0) {
            await sendStep3ItemPrompt(
                remoteJid,
                effectiveSender,
                {},
                userLang,
                ctx,
                mentions,
                t("adminFeatured.step3ItemNotFound", userLang, { query })
            );
            return true;
        }

        if (matches.length === 1) {
            await sendStep4PreviewAndConfirm(remoteJid, effectiveSender, matches[0]!, userLang, ctx, mentions);
            return true;
        }

        if (matches.length <= 3) {
            ctx.state.setAdminFeaturedStep?.(
                effectiveSender,
                "ADMIN_AWAITING_FEATURED_ITEM",
                {
                    candidateItems: matches.map((m) => ({ id: m.id, name: m.name }))
                },
                remoteJid
            );
            const buttons = matches.map((m, idx) => ({
                id: `btn_admin_featured_pick_${idx}`,
                text: truncateButtonLabel(m.name)
            }));
            if (matches.length === 2) {
                buttons.push({ id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) });
            }
            const listLines = matches.map((m, idx) => `${idx + 1}. *${m.name}*`).join("\n");
            const body = `${t("adminFeatured.step3MultipleMatches", userLang, { count: matches.length, query })}\n\n${listLines}`;
            await sendButtonsOrFallback(ctx, remoteJid, buildQuickReplyPayload(body, buttons), mentions);
            return true;
        }

        const topItems = matches
            .slice(0, 10)
            .map((m, idx) => `${idx + 1}. *${m.name}* (${formatRupiah(m.rupiahPrice)})`)
            .join("\n");
        const overflowBody = t("adminFeatured.step3MultipleMatchesOverflow", userLang, {
            count: matches.length,
            query,
            itemList: topItems
        });
        await sendButtonsOrFallback(
            ctx,
            remoteJid,
            buildQuickReplyPayload(overflowBody, [
                { id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) }
            ]),
            mentions
        );
        return true;
    }

    // Step 4: Re-prompt confirm buttons if admin types while waiting on confirm card
    if (step === "ADMIN_AWAITING_FEATURED_CONFIRM" && draft?.itemName) {
        try {
            const catalog = await ctx.client.getCatalog("IDR");
            const selected = catalog.find(
                (i) => i.active && i.name.toLowerCase() === draft.itemName!.toLowerCase()
            );
            if (selected) {
                const confirmText = t("adminFeatured.step4ConfirmPrompt", userLang, {
                    itemName: selected.name,
                    price: formatRupiah(selected.rupiahPrice),
                    discountPercent: selected.discountPercent ?? 0
                });
                await sendButtonsOrFallback(
                    ctx,
                    remoteJid,
                    buildQuickReplyPayload(confirmText, [
                        { id: "btn_admin_featured_save_on", text: t("adminFeatured.btnSaveEnable", userLang) },
                        { id: "btn_admin_featured_save_off", text: t("adminFeatured.btnSaveDisabled", userLang) },
                        { id: "btn_admin_featured_cancel", text: t("adminFeatured.btnCancel", userLang) }
                    ]),
                    mentions
                );
            }
        } catch {
            // ignore re-prompt fetch errors
        }
        return true;
    }

    return false;
}
