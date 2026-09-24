import type { CoreClient } from "../coreClient";
import type { StateManager } from "../state";
import type { CatalogItem } from "../types";
import type { AdminGroupLogger } from "./adminLogger";
import { generateQrisBuffer } from "../qr";
import { generateCategoryPoster, getItemImageBuffer, resolveItemImageUrl, clearPosterCache } from "../poster";
import { formatStatusBadge, formatRupiah, t, type Language } from "../i18n";
import { config } from "../config";

export { formatStatusBadge, formatRupiah };

export interface BotContext {
    client: CoreClient;
    state: StateManager;
    adminNumber: string;
    adminLogger?: AdminGroupLogger;
    sendText(jid: string, text: string, mentions?: string[]): Promise<void>;
    sendImage(jid: string, buffer: Buffer, caption: string): Promise<any>;
    sendPoll?(jid: string, title: string, options: string[]): Promise<void>;
}

export interface CategoryDefinition {
    id: string;
    displayName: string;
    dbCategory: string;
}

export const CATEGORIES: CategoryDefinition[] = [
    { id: "1", displayName: "1. 👑 Main Store & Ranks", dbCategory: "Main Store" },
    { id: "2", displayName: "2. 🐾 Pets", dbCategory: "Regular Pet" },
    { id: "3", displayName: "3. 🦄 Mounts", dbCategory: "Regular Mount" },
    { id: "4", displayName: "4. 🎩 Hats", dbCategory: "Hats" },
    { id: "5", displayName: "5. 🎒 Back Blings", dbCategory: "Back Blings" },
    { id: "6", displayName: "6. 🔪 Murder Mystery Packs", dbCategory: "Murder Mystery Packs" }
];

export function resolveCategory(input: string, categories: CategoryDefinition[]): CategoryDefinition | undefined {
    const trimmed = input.trim().toLowerCase();

    // Check by number ID (e.g. "1", "2")
    const byId = categories.find((c) => c.id === trimmed);
    if (byId) return byId;

    // Check by number prefix (e.g. "1." or "1. 👑 ...")
    const matchNumber = trimmed.match(/^(\d+)/);
    if (matchNumber && matchNumber[1]) {
        const byMatchId = categories.find((c) => c.id === matchNumber[1]);
        if (byMatchId) return byMatchId;
    }

    // Check by substring in displayName or dbCategory
    return categories.find(
        (c) =>
            c.displayName.toLowerCase().includes(trimmed) ||
            c.dbCategory.toLowerCase().includes(trimmed) ||
            trimmed.includes(c.dbCategory.toLowerCase())
    );
}

export function formatStatusText(
    order: {
        id: string;
        itemName: string;
        gamertag: string;
        status: string;
        totalNominal: number;
        failureReason?: string | null;
    },
    adminNumber: string,
    lang: Language = "id"
): string {
    const badge = formatStatusBadge(order.status, lang, order.failureReason);
    if (lang === "en") {
        return (
            `🔍 *ORDER STATUS #${order.id}*\n\n` +
            `📦 Item: *${order.itemName}*\n` +
            `👤 Gamertag: *${order.gamertag}*\n` +
            `📊 Status: *${badge}*\n` +
            `💰 Total: *${formatRupiah(order.totalNominal)}*\n\n` +
            `Any questions? Contact our admin at: wa.me/${adminNumber}`
        );
    }
    return (
        `🔍 *STATUS PESANAN #${order.id}*\n\n` +
        `📦 Item: *${order.itemName}*\n` +
        `👤 Gamertag: *${order.gamertag}*\n` +
        `📊 Status: *${badge}*\n` +
        `💰 Total: *${formatRupiah(order.totalNominal)}*\n\n` +
        `Ada pertanyaan kak? Hubungi admin kami di: wa.me/${adminNumber}`
    );
}

async function handleReprocessCommand(
    remoteJid: string,
    args: string[],
    ctx: BotContext
): Promise<void> {
    if (args.length === 0) {
        try {
            const res = await ctx.client.retryAllOrders();
            await ctx.sendText(
                remoteJid,
                `🔄 *REPROCESS SELESAI*\n\n` +
                `✅ Berhasil memproses ulang *${res.count} pesanan* yang tertahan token:\n` +
                (res.orderIds.length > 0 ? res.orderIds.map((id) => `• #${id}`).join("\n") : "_Tidak ada pesanan yang tertahan._")
            );
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal memproses ulang pesanan: ${errMsg}`);
        }
    } else {
        const targetId = (args[0] || "").replace(/^#/, "");
        try {
            const res = await ctx.client.retryOrder(targetId);
            await ctx.sendText(
                remoteJid,
                `🔄 *PESANAN #${res.orderId} DIPROSES ULANG*\n\n` +
                `Pesanan telah dimasukkan kembali ke dalam antrean gifting The Hive! 🚀`
            );
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal memproses ulang pesanan #${targetId}: ${errMsg}`);
        }
    }
}

async function handleSetDiscountCommand(
    remoteJid: string,
    args: string[],
    ctx: BotContext,
    userLang: Language
): Promise<void> {
    if (args.length === 0) {
        const usage = userLang === "en"
            ? `💡 *Usage:* */setdiscount <0-90>*\nExample: */setdiscount 40* (set store discount to 40%)\nUse *0* to disable discount.`
            : `💡 *Penggunaan:* */setdiskon <0-90>*\nContoh: */setdiskon 40* (set diskon toko 40%)\nGunakan *0* untuk mematikan diskon.`;
        await ctx.sendText(remoteJid, usage);
        return;
    }

    const percent = parseInt(args[0], 10);
    if (isNaN(percent) || percent < 0 || percent > 90) {
        const err = userLang === "en"
            ? `❌ Discount percentage must be a whole number between 0 and 90.`
            : `❌ Persentase diskon harus berupa angka bulat antara 0 hingga 90.`;
        await ctx.sendText(remoteJid, err);
        return;
    }

    try {
        await ctx.client.setStoreDiscount(percent);
        clearPosterCache();
        await ctx.sendText(remoteJid, t("discountUpdated", userLang, { percent }));
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await ctx.sendText(remoteJid, `❌ Gagal mengubah diskon: ${errMsg}`);
    }
}

async function handleVoucherCommand(
    remoteJid: string,
    args: string[],
    ctx: BotContext,
    userLang: Language
): Promise<void> {
    const subCmd = (args[0] || "").toLowerCase();

    if (!subCmd || subCmd === "list" || subCmd === "daftar") {
        try {
            const status = await ctx.client.getVoucherStatus();
            let out = userLang === "en"
                ? `🎟️ *VOUCHER & PROMO MANAGEMENT*\n\n`
                : `🎟️ *MANAJEMEN VOUCHER & PROMO*\n\n`;

            out += userLang === "en"
                ? `🏷️ Active Store Discount: *${status.discountPercent}%*\n\n`
                : `🏷️ Diskon Toko Global: *${status.discountPercent}%*\n\n`;

            out += userLang === "en" ? `*Active Voucher Codes:*\n` : `*Daftar Voucher Aktif:*\n`;

            if (status.vouchers.length === 0) {
                out += userLang === "en"
                    ? `_No active vouchers found._\n`
                    : `_Belum ada voucher yang aktif saat ini._\n`;
            } else {
                status.vouchers.forEach((v, idx) => {
                    const val = v.discountType === "PERCENT" ? `${v.discountValue}%` : formatRupiah(v.discountValue);
                    const quota = v.maxUses ? `${v.usedCount}/${v.maxUses}` : `${v.usedCount}/∞`;
                    const statusTag = v.active ? "✅" : "❌";
                    out += `${idx + 1}. *${v.code}* (${val}) — Kuota: ${quota} ${statusTag}\n`;
                });
            }

            out += userLang === "en"
                ? `\n💡 *Commands:*\n• */voucher create <CODE> <VALUE> [QUOTA]*\n  (e.g. */voucher create SAVE10 10% 50* or */voucher create FLAT5K 5000*)\n• */voucher delete <CODE>*`
                : `\n💡 *Perintah:*\n• */voucher create <KODE> <NILAI> [KUOTA]*\n  (contoh: */voucher create HEMAT10 10% 50* atau */voucher buat POTONGAN 5000*)\n• */voucher delete <KODE>*`;

            await ctx.sendText(remoteJid, out);
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal mengambil status voucher: ${errMsg}`);
        }
        return;
    }

    if (subCmd === "create" || subCmd === "buat") {
        const code = (args[1] || "").trim().toUpperCase();
        const valueRaw = (args[2] || "").trim();
        const quotaRaw = args[3]?.trim();

        if (!code || !valueRaw) {
            const err = userLang === "en"
                ? `💡 *Usage:* */voucher create <CODE> <VALUE> [QUOTA]*\nExamples:\n• */voucher create SAVE10 10% 50*\n• */voucher create FLAT5K 5000*`
                : `💡 *Penggunaan:* */voucher create <KODE> <NILAI> [KUOTA]*\nContoh:\n• */voucher create HEMAT10 10% 50*\n• */voucher buat POTONGAN 5000*`;
            await ctx.sendText(remoteJid, err);
            return;
        }

        let discountType: "PERCENT" | "FLAT" = "FLAT";
        let discountValue = 0;

        if (valueRaw.endsWith("%")) {
            discountType = "PERCENT";
            discountValue = parseInt(valueRaw.replace("%", ""), 10);
            if (isNaN(discountValue) || discountValue < 1 || discountValue > 90) {
                const msg = userLang === "en"
                    ? `❌ Percentage discount must be between 1% and 90%.`
                    : `❌ Diskon persentase harus antara 1% hingga 90%.`;
                await ctx.sendText(remoteJid, msg);
                return;
            }
        } else {
            const cleanedNum = parseInt(valueRaw.replace(/[^0-9]/g, ""), 10);
            discountValue = cleanedNum;
            if (isNaN(discountValue) || discountValue < 1000) {
                const msg = userLang === "en"
                    ? `❌ Flat discount must be at least Rp 1.000.`
                    : `❌ Diskon nominal minimal Rp 1.000.`;
                await ctx.sendText(remoteJid, msg);
                return;
            }
        }

        let maxUses: number | undefined;
        if (quotaRaw) {
            const q = parseInt(quotaRaw, 10);
            if (!isNaN(q) && q > 0) {
                maxUses = q;
            }
        }

        try {
            await ctx.client.createVoucher({
                code,
                discountType,
                discountValue,
                maxUses
            });
            const formattedVal = discountType === "PERCENT" ? `${discountValue}%` : formatRupiah(discountValue);
            await ctx.sendText(remoteJid, t("voucherCreated", userLang, {
                code,
                discountType,
                discountValue: formattedVal,
                maxUses: maxUses ?? (userLang === "en" ? "Unlimited" : "Tak terbatas")
            }));
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal membuat voucher: ${errMsg}`);
        }
        return;
    }

    if (subCmd === "delete" || subCmd === "hapus") {
        const code = (args[1] || "").trim().toUpperCase();
        if (!code) {
            const err = userLang === "en"
                ? `💡 *Usage:* */voucher delete <CODE>*`
                : `💡 *Penggunaan:* */voucher delete <KODE>*`;
            await ctx.sendText(remoteJid, err);
            return;
        }

        try {
            await ctx.client.deleteVoucher(code);
            await ctx.sendText(remoteJid, t("voucherDeleted", userLang, { code }));
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal menghapus voucher: ${errMsg}`);
        }
        return;
    }

    // Default unknown voucher subcommand
    await ctx.sendText(
        remoteJid,
        userLang === "en"
            ? `⚠️ Unknown voucher command. Use */voucher list*, */voucher create*, or */voucher delete*.`
            : `⚠️ Perintah voucher tidak dikenal. Gunakan */voucher list*, */voucher create*, atau */voucher delete*.`
    );
}

export function renderOrderCategoryMenu(isRedirectFromMenu = false, lang: Language = "id"): string {
    if (lang === "en") {
        let out = "";
        if (isRedirectFromMenu) {
            out += `💡 _Info: The */menu* command has been merged into */buy*!_\n\n`;
        }
        out += `🛍️ *${config.STORE_NAME.toUpperCase()} — CATALOG & ORDERING*\n`;
        out += `> Official cosmetics discount up to 50% for The Hive! ✨\n\n`;
        out += `Hello! What cosmetics are you looking for today? Please choose a category below:\n\n`;
        CATEGORIES.forEach((cat) => {
            out += `*${cat.id}.* ${cat.displayName.replace(/^\d+\.\s*/, "")}\n`;
        });
        out += `\n💡 _Type the category number (*1 - 6*) to view catalog & order._\n`;
        out += `❌ _Type *c* or *cancel* to exit._`;
        return out;
    }

    let out = "";
    if (isRedirectFromMenu) {
        out += `💡 _Info: Perintah */menu* sekarang sudah digabung ke */beli* ya kak!_\n\n`;
    }
    out += `🛍️ *${config.STORE_NAME.toUpperCase()} — KATALOG & PEMESANAN*\n`;
    out += `> Diskon resmi s/d 50% untuk kosmetik The Hive! ✨\n\n`;
    out += `Halo kak! Mau cari kosmetik apa hari ini? Silakan pilih kategori di bawah ya:\n\n`;
    CATEGORIES.forEach((cat) => {
        out += `*${cat.id}.* ${cat.displayName.replace(/^\d+\.\s*/, "")}\n`;
    });
    out += `\n💡 _Ketik nomor kategori (*1 - 6*) untuk melihat katalog & memesan._\n`;
    out += `❌ _Ketik *b* atau *batal* untuk keluar._`;
    return out;
}

export function renderMainMenu(lang: Language = "id"): string {
    return renderOrderCategoryMenu(true, lang);
}

export function renderCategoryItems(items: CatalogItem[], category: CategoryDefinition, lang: Language = "id"): string {
    const active = items.filter((i) => i.active && i.category === category.dbCategory);

    if (active.length === 0) {
        return lang === "en"
            ? `⚠️ No active items in category *${category.displayName}* yet.`
            : `⚠️ Belum ada item aktif di kategori *${category.displayName}* nih kak.`;
    }

    if (lang === "en") {
        let out = `📁 *CATALOG: ${category.displayName.toUpperCase()}* (${active.length} Items)\n`;
        out += `Official store discount up to 50%! ⚡\n\n`;

        active.forEach((item, idx) => {
            out += `${idx + 1}. *${item.name}*\n`;
            out += `   ~${formatRupiah(item.originalPrice)}~ ➔ *${formatRupiah(item.rupiahPrice)}* (Discount ${item.discountPercent}%)\n`;
        });

        out += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
        out += `Type the item number (*1 - ${active.length}*) to buy this item!\n`;
        out += `Type *b* to return to category list, or *c* to cancel.`;
        return out;
    }

    let out = `📁 *KATALOG: ${category.displayName.toUpperCase()}* (${active.length} Item)\n`;
    out += `Harga resmi diskon hingga 50%! ⚡\n\n`;

    active.forEach((item, idx) => {
        out += `${idx + 1}. *${item.name}*\n`;
        out += `   ~${formatRupiah(item.originalPrice)}~ ➔ *${formatRupiah(item.rupiahPrice)}* (Diskon ${item.discountPercent}%)\n`;
    });

    out += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    out += `Ketik nomor item (*1 - ${active.length}*) untuk membeli item ini ya kak!\n`;
    out += `Ketik *k* untuk kembali ke kategori, atau *b* untuk batal.`;
    return out;
}

async function sendCategoryOrderPoster(
    remoteJid: string,
    cat: CategoryDefinition,
    ctx: BotContext,
    lang: Language = "id"
): Promise<void> {
    const catalog = await ctx.client.getCatalog();
    const categoryItems = catalog.filter((i) => i.active && i.category === cat.dbCategory);

    if (categoryItems.length === 0) {
        if (lang === "en") {
            await ctx.sendText(
                remoteJid,
                `⚠️ No active items in category *${cat.displayName}* yet. Type *b* to pick another category or *c* to cancel.`
            );
        } else {
            await ctx.sendText(
                remoteJid,
                `⚠️ Belum ada item aktif di kategori *${cat.displayName}* nih kak. Ketik *k* untuk pilih kategori lain atau *b* untuk batal.`
            );
        }
        return;
    }

    const caption = lang === "en" ? (
        `🛒 *CATALOG: ${cat.displayName.toUpperCase()}*\n\n` +
        `There are *${categoryItems.length} awesome items* with up to 50% discount! ⚡\n\n` +
        `Please type the *item number* (*1 - ${categoryItems.length}*) from the image above that you'd like to buy:\n` +
        `• Type *b* to return to category list\n` +
        `• Type *c* to cancel order`
    ) : (
        `🛒 *KATALOG: ${cat.displayName.toUpperCase()}*\n\n` +
        `Ada *${categoryItems.length} item* kece dengan diskon s/d 50%! ⚡\n\n` +
        `Silakan ketik *nomor item* (*1 - ${categoryItems.length}*) dari gambar di atas yang mau kakak beli ya:\n` +
        `• Ketik *k* untuk kembali ke pilihan kategori\n` +
        `• Ketik *b* untuk membatalkan pesanan`
    );

    try {
        const posterBuffer = await generateCategoryPoster(cat, catalog);
        await ctx.sendImage(remoteJid, posterBuffer, caption);
        return;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Category Poster Error]:", msg);
    }

    // Fallback to text if poster fails
    let out = lang === "en"
        ? `🛒 *SELECT ITEM [ ${cat.displayName.toUpperCase()} ]*\n\n`
        : `🛒 *PILIH ITEM [ ${cat.displayName.toUpperCase()} ]*\n\n`;

    categoryItems.forEach((item, idx) => {
        out += `*${idx + 1}.* *${item.name}* (~${formatRupiah(item.originalPrice)}~ ➔ *${formatRupiah(item.rupiahPrice)}*)\n`;
    });

    if (lang === "en") {
        out += `\nPlease type the item number (*1 - ${categoryItems.length}*) you want to buy:\n`;
        out += `• Type *b* to return to category list\n`;
        out += `• Type *c* to cancel order`;
    } else {
        out += `\nSilakan ketik nomor item (*1 - ${categoryItems.length}*) yang mau kakak beli ya:\n`;
        out += `• Ketik *k* untuk kembali ke kategori\n`;
        out += `• Ketik *b* untuk membatalkan pesanan`;
    }

    await ctx.sendText(remoteJid, out);
}

/**
 * Safely extracts text content from various WhatsApp message envelopes (plain, extended, ephemeral, view-once, media captions).
 */
export function extractMessageText(message: unknown): string {
    if (!message || typeof message !== "object") return "";

    const msgObj = message as Record<string, unknown>;

    // Unwrap envelope wrappers if message is ephemeral, view-once, or document
    const innerMsg =
        (msgObj.ephemeralMessage as Record<string, unknown> | undefined)?.message ??
        (msgObj.viewOnceMessage as Record<string, unknown> | undefined)?.message ??
        (msgObj.viewOnceMessageV2 as Record<string, unknown> | undefined)?.message ??
        (msgObj.documentWithCaptionMessage as Record<string, unknown> | undefined)?.message ??
        msgObj;

    if (!innerMsg || typeof innerMsg !== "object") return "";
    const innerObj = innerMsg as Record<string, unknown>;

    if (typeof innerObj.conversation === "string") {
        return innerObj.conversation;
    }

    const extended = innerObj.extendedTextMessage as Record<string, unknown> | undefined;
    if (typeof extended?.text === "string") {
        return extended.text;
    }

    const image = innerObj.imageMessage as Record<string, unknown> | undefined;
    if (typeof image?.caption === "string") {
        return image.caption;
    }

    const video = innerObj.videoMessage as Record<string, unknown> | undefined;
    if (typeof video?.caption === "string") {
        return video.caption;
    }

    return "";
}

/**
 * Checks if the JID belongs to a 1:1 private chat (@s.whatsapp.net or @lid).
 * Strictly filters out groups (@g.us), status broadcasts, and newsletters.
 */
export function isPrivateChat(remoteJid: string): boolean {
    if (!remoteJid) return false;
    if (
        remoteJid.endsWith("@g.us") ||
        remoteJid.includes("@broadcast") ||
        remoteJid.includes("@newsletter")
    ) {
        return false;
    }
    return remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
}

/**
 * Normalizes WhatsApp JIDs and phone numbers:
 * - Strips domain (@s.whatsapp.net, @lid, @g.us)
 * - Strips multi-device suffix (:0, :1, :2)
 * - Normalizes Indonesian 08... to 628...
 */
export function extractPhoneNumber(jidOrPhone: string): string {
    if (!jidOrPhone) return "";
    const userPart = jidOrPhone.split("@")[0] || "";
    const phonePart = userPart.split(":")[0] || "";
    let digits = phonePart.replace(/[^0-9]/g, "");
    if (digits.startsWith("0")) {
        digits = "62" + digits.slice(1);
    } else if (digits.startsWith("8") && digits.length >= 9 && digits.length <= 13) {
        digits = "62" + digits;
    }
    return digits;
}

/**
 * Checks if the message sender is an authorized administrator.
 */
export function isUserAdmin(
    remoteJid: string,
    fromMe: boolean,
    effectiveSender: string,
    adminNumber: string,
    adminLogger?: AdminGroupLogger
): boolean {
    if (fromMe) return true;

    const configuredAdmins = (adminNumber || "")
        .split(",")
        .map((num) => extractPhoneNumber(num.trim()))
        .filter(Boolean);

    const cleanSender = extractPhoneNumber(effectiveSender);
    const cleanRemote = extractPhoneNumber(remoteJid);

    if (configuredAdmins.length > 0) {
        if (
            (cleanSender && configuredAdmins.includes(cleanSender)) ||
            (cleanRemote && configuredAdmins.includes(cleanRemote))
        ) {
            return true;
        }
    }

    if (adminLogger && remoteJid === adminLogger.getGroupJid()) {
        return true;
    }

    return false;
}

const GREETINGS = [
    "halo", "halo kak", "halo min", "hai", "hai kak", "hi", "hi kak", "hey",
    "p", "tes", "test", "assalamualaikum", "assalamu'alaikum",
    "selamat pagi", "pagi", "selamat siang", "siang", "selamat sore", "sore", "selamat malam", "malam"
];

async function sendUnrecognizedCommand(
    remoteJid: string,
    cmd: string,
    userLang: Language,
    ctx: BotContext
): Promise<void> {
    if (userLang === "en") {
        await ctx.sendText(
            remoteJid,
            `Oops, command *${cmd}* was not recognized 😊\nType */buy* to start shopping or */help* for assistance.`
        );
    } else {
        await ctx.sendText(
            remoteJid,
            `Waduh, perintah *${cmd}* tidak dikenali nih kak 😊\nKetik */beli* untuk mulai belanja atau */bantuan* untuk melihat panduan ya.`
        );
    }
}

export async function handleIncomingMessage(
    remoteJid: string,
    fromMe: boolean,
    bodyText: string,
    ctx: BotContext,
    participant?: string
): Promise<void> {
    const isGroup = remoteJid.endsWith("@g.us");
    if (!isPrivateChat(remoteJid) && !isGroup) {
        return;
    }

    const trimmed = bodyText.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();

    // Determine sender identity and language preference
    const effectiveSender = isGroup ? (participant || remoteJid) : remoteJid;
    const userLang = ctx.state.getLanguage(effectiveSender);
    const senderPhone = extractPhoneNumber(effectiveSender);

    // 1. Check if group message
    if (isGroup) {
        if (lower === "/setgroup" || lower.startsWith("/setgroup ")) {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            if (!isAdmin) {
                return;
            }
            if (ctx.adminLogger) {
                ctx.adminLogger.setGroupJid(remoteJid);
                await ctx.sendText(remoteJid, `✅ Grup ini berhasil didaftarkan sebagai Admin Group ${config.STORE_NAME}!`);
            }
            return;
        }

        if (
            lower === "/reprocess" ||
            lower.startsWith("/reprocess ") ||
            lower === "/retry" ||
            lower.startsWith("/retry ")
        ) {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            if (!isAdmin) {
                return;
            }
            const parts = trimmed.split(/\s+/);
            await handleReprocessCommand(remoteJid, parts.slice(1), ctx);
            return;
        }

        if (
            lower === "/setdiskon" ||
            lower.startsWith("/setdiskon ") ||
            lower === "/setdiscount" ||
            lower.startsWith("/setdiscount ")
        ) {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            if (!isAdmin) {
                return;
            }
            const parts = trimmed.split(/\s+/);
            await handleSetDiscountCommand(remoteJid, parts.slice(1), ctx, userLang);
            return;
        }

        if (lower === "/voucher" || lower.startsWith("/voucher ")) {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            if (!isAdmin) {
                return;
            }
            const parts = trimmed.split(/\s+/);
            await handleVoucherCommand(remoteJid, parts.slice(1), ctx, userLang);
            return;
        }

        if (lower === "/admin" || lower.startsWith("/admin ")) {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            if (!isAdmin) {
                return;
            }
            const groupJid = ctx.adminLogger?.getGroupJid();
            const groupStatus = groupJid === remoteJid ? "✅ Grup ini terdaftar sebagai Admin Group" : `Grup terdaftar: ${groupJid || "Belum ada"}`;
            let out = `@${senderPhone}\n\n🛠️ *PANEL ADMIN ${config.STORE_NAME.toUpperCase()}*\n\n`;
            out += `👤 Status: *Terverifikasi Admin ✅*\n`;
            out += `📱 Nomor: *+${senderPhone}*\n`;
            out += `👥 Grup: *${groupStatus}*\n\n`;
            out += `*Daftar Perintah Admin:*\n`;
            out += `• */reprocess* : Proses ulang semua order tertahan\n`;
            out += `• */reprocess <ID>* : Proses ulang order tertentu\n`;
            out += `• */setgroup* : Daftarkan grup ini sebagai Admin Group\n`;
            out += `• */setdiskon <0-90>* : Ubah persentase diskon toko global\n`;
            out += `• */voucher* : Kelola kode voucher promo (list/create/delete)\n`;
            out += `• */status <ID>* : Cek detail status order manapun\n`;
            await ctx.sendText(remoteJid, out, [effectiveSender]);
            return;
        }

        // If no participant is provided in group, we cannot track the user or DM them
        if (!participant) {
            return;
        }

        // Only handle command triggers in groups to keep chat clean
        if (!trimmed.startsWith("/")) {
            return;
        }

        const parts = trimmed.split(/\s+/);
        const cmd = parts[0]?.toLowerCase() || "";
        const args = parts.slice(1);

        // Language command in group
        if (cmd === "/bahasa" || cmd === "/language") {
            const langArg = args[0]?.toLowerCase();
            if (langArg === "en" || langArg === "english") {
                ctx.state.setLanguage(effectiveSender, "en");
                const text = `@${senderPhone}\n\n` + t("languageSwitched", "en");
                await ctx.sendText(remoteJid, text, [effectiveSender]);
                return;
            } else if (langArg === "id" || langArg === "indonesia" || langArg === "indo") {
                ctx.state.setLanguage(effectiveSender, "id");
                const text = `@${senderPhone}\n\n` + t("languageSwitched", "id");
                await ctx.sendText(remoteJid, text, [effectiveSender]);
                return;
            } else {
                const text = `@${senderPhone}\n\n` + t("currentLanguageStatus", userLang);
                await ctx.sendText(remoteJid, text, [effectiveSender]);
                return;
            }
        }

        // Cross-language hints in group
        if (cmd === "/buy" && userLang === "id") {
            const text = `@${senderPhone}\n\n` + t("crossLanguageHint", "id");
            await ctx.sendText(remoteJid, text, [effectiveSender]);
            return;
        }
        if (cmd === "/beli" && userLang === "en") {
            const text = `@${senderPhone}\n\n` + t("crossLanguageHint", "en");
            await ctx.sendText(remoteJid, text, [effectiveSender]);
            return;
        }

        // Buying / Catalog flow redirection to DM
        if (
            cmd === "/beli" ||
            cmd === "/buy" ||
            cmd === "/menu" ||
            cmd === "/katalog" ||
            cmd === "/catalog"
        ) {
            const groupNotice = t("groupCheckoutRedirection", userLang, { phone: senderPhone });
            await ctx.sendText(remoteJid, groupNotice, [effectiveSender]);

            ctx.state.startBuyingFlow(effectiveSender);
            const dmMenu = renderOrderCategoryMenu(false, userLang);
            await ctx.sendText(effectiveSender, dmMenu);
            return;
        }

        // FAQ in group
        if (cmd === "/faq" || cmd === "/tanya") {
            const faqMsg = `@${senderPhone}\n\n` + t("faqMessage", userLang, { adminNumber: ctx.adminNumber });
            await ctx.sendText(remoteJid, faqMsg, [effectiveSender]);
            return;
        }

        // Help in group
        if (cmd === "/bantuan" || cmd === "/help") {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            const helpMsg = `@${senderPhone}\n\n` + t("helpMessage", userLang, { adminNumber: ctx.adminNumber, isAdmin });
            await ctx.sendText(remoteJid, helpMsg, [effectiveSender]);
            return;
        }

        // Status check in group
        if (cmd === "/status") {
            const orderId = args[0];
            if (!orderId) {
                try {
                    const orders = await ctx.client.getUserOrders(effectiveSender);
                    if (!orders || orders.length === 0) {
                        const emptyMsg = `@${senderPhone}\n\n` + t("emptyOrders", userLang);
                        await ctx.sendText(remoteJid, emptyMsg, [effectiveSender]);
                        return;
                    }
                    const activeOrder = orders.find(
                        (o) =>
                            o.status === "PENDING_PAYMENT" ||
                            o.status === "QUEUED" ||
                            o.status === "GIFTING" ||
                            o.status === "INSUFFICIENT_TOKENS"
                    ) ?? orders[0];

                    if (activeOrder) {
                        const statusMsg = `@${senderPhone}\n\n` + formatStatusText(activeOrder, ctx.adminNumber, userLang);
                        await ctx.sendText(remoteJid, statusMsg, [effectiveSender]);
                    }
                } catch (err: unknown) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    await ctx.sendText(remoteJid, `@${senderPhone}\n\n❌ Gagal: ${errMsg}`, [effectiveSender]);
                }
                return;
            }

            try {
                const cleanId = orderId.replace(/^#/, "");
                const order = await ctx.client.getOrderStatus(cleanId);
                const statusMsg = `@${senderPhone}\n\n` + formatStatusText(order, ctx.adminNumber, userLang);
                await ctx.sendText(remoteJid, statusMsg, [effectiveSender]);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `@${senderPhone}\n\n❌ Gagal: ${errMsg}`, [effectiveSender]);
            }
            return;
        }

        // History in group
        if (cmd === "/riwayat" || cmd === "/history") {
            try {
                const orders = await ctx.client.getUserOrders(effectiveSender);
                if (!orders || orders.length === 0) {
                    const msg = `@${senderPhone}\n\n` + (userLang === "en"
                        ? "Hi there! You don't have any order history yet 😊\n\nStart shopping by typing */buy*!"
                        : "Halo kak! Belum ada riwayat pesanan untuk nomor ini nih 😊\n\nYuk mulai belanja dengan ketik */beli* ya!");
                    await ctx.sendText(remoteJid, msg, [effectiveSender]);
                    return;
                }

                const recent = orders.slice(0, 5);
                let out = `@${senderPhone}\n\n` + (userLang === "en"
                    ? `📜 *ORDER HISTORY*\nRecent orders in ${config.STORE_NAME}:\n\n`
                    : `📜 *RIWAYAT PESANAN KAKAK*\nDaftar pesanan terbaru di ${config.STORE_NAME}:\n\n`);

                recent.forEach((ord, idx) => {
                    const badge = formatStatusBadge(ord.status, userLang, ord.failureReason);
                    out += `${idx + 1}. *#${ord.id}* — ${badge}\n`;
                    out += `   📦 ${ord.itemName} (${ord.gamertag})\n`;
                    out += `   💰 ${formatRupiah(ord.totalNominal)}\n\n`;
                });

                out += userLang === "en"
                    ? `💡 _Type */status <ID>* to check details of a specific order._`
                    : `💡 _Ketik */status <ID>* untuk melihat detail status pesanan tertentu._`;

                await ctx.sendText(remoteJid, out, [effectiveSender]);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `@${senderPhone}\n\n❌ Gagal: ${errMsg}`, [effectiveSender]);
            }
            return;
        }

        return;
    }

    // 2. Private 1:1 Chat Handling
    const session = ctx.state.getSession(remoteJid);
    const isCategoryInput = resolveCategory(trimmed, CATEGORIES) !== undefined;
    const isGreeting = GREETINGS.includes(lower);

    // Cancel / Back shortcuts by language
    const isCancel =
        userLang === "en"
            ? (lower === "c" || lower === "cancel" || lower === "/cancel")
            : (lower === "b" || lower === "batal" || lower === "/batal");

    const isBack =
        userLang === "en"
            ? (lower === "b" || lower === "back" || lower === "0")
            : (lower === "k" || lower === "kembali" || lower === "0");

    const isExplicitCancelCommand = lower === "/batal" || lower === "/cancel";

    // Prevent loops: ignore self messages UNLESS user is testing command, in active session, picking category, or greeting
    if (fromMe && !trimmed.startsWith("/") && session.step === "IDLE" && !isCategoryInput && !isGreeting && !isCancel && !isBack && !isExplicitCancelCommand) {
        return;
    }

    // Language switch & cross-language hints in private chat
    if (trimmed.startsWith("/")) {
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0]?.toLowerCase() || "";
        const args = parts.slice(1);

        if (cmd === "/bahasa" || cmd === "/language") {
            const langArg = args[0]?.toLowerCase();
            if (langArg === "en" || langArg === "english") {
                ctx.state.setLanguage(remoteJid, "en");
                await ctx.sendText(remoteJid, t("languageSwitched", "en"));
                return;
            } else if (langArg === "id" || langArg === "indonesia" || langArg === "indo") {
                ctx.state.setLanguage(remoteJid, "id");
                await ctx.sendText(remoteJid, t("languageSwitched", "id"));
                return;
            } else {
                await ctx.sendText(remoteJid, t("currentLanguageStatus", userLang));
                return;
            }
        }

        if (cmd === "/buy" && userLang === "id") {
            await ctx.sendText(remoteJid, t("crossLanguageHint", "id"));
            return;
        }
        if (cmd === "/beli" && userLang === "en") {
            await ctx.sendText(remoteJid, t("crossLanguageHint", "en"));
            return;
        }
    }

    // Cancellation shortcut
    if (isCancel || isExplicitCancelCommand) {
        if (session.step !== "IDLE") {
            ctx.state.clear(remoteJid);
            await ctx.sendText(remoteJid, t("cancelSuccess", userLang));
            return;
        } else if (trimmed.startsWith("/")) {
            await ctx.sendText(remoteJid, t("noActiveOrderToCancel", userLang));
            return;
        }
    }

    // Back navigation shortcut
    if (session.step !== "IDLE" && isBack) {
        if (session.step === "AWAITING_ITEM") {
            ctx.state.startBuyingFlow(remoteJid);
            const backMsg = userLang === "en"
                ? `Back to category selection! 😊\n\n` + renderOrderCategoryMenu(false, "en")
                : `Kembali ke pilihan kategori ya kak! 😊\n\n` + renderOrderCategoryMenu(false, "id");
            await ctx.sendText(remoteJid, backMsg);
            return;
        }

        if (session.step === "AWAITING_GAMERTAG") {
            const cat = CATEGORIES.find((c) => c.dbCategory === session.selectedCategory);
            if (cat) {
                ctx.state.setCategory(remoteJid, cat.dbCategory);
                await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
                return;
            } else {
                ctx.state.startBuyingFlow(remoteJid);
                await ctx.sendText(remoteJid, renderOrderCategoryMenu(false, userLang));
                return;
            }
        }

        if (session.step === "AWAITING_CONFIRMATION") {
            session.step = "AWAITING_GAMERTAG";
            session.lastUpdated = Date.now();
            ctx.state.clearAppliedVoucher(remoteJid);
            const reEnterMsg = userLang === "en"
                ? `Please re-enter your *Minecraft Bedrock Gamertag*:\n⚠️ *CRITICAL:* Double-check spelling and spaces! Once gifted, orders *CANNOT BE CANCELLED OR REFUNDED* by anyone (including The Hive)!\n\n_(Type *b* to change item, or *c* to cancel)_`
                : `Silakan masukkan ulang *Gamertag Minecraft Bedrock* kakak ya:\n⚠️ *PENTING:* Perhatikan huruf & spasi! Jika item sudah terkirim ke gamertag tersebut, pesanan *TIDAK BISA DIBATALKAN / DI-REFUND* sama sekali oleh siapapun (termasuk The Hive sendiri)!\n\n_(Ketik *k* untuk ganti item, atau *b* untuk batalkan)_`;
            await ctx.sendText(remoteJid, reEnterMsg);
            return;
        }
    }

    // Active buying flow steps
    if (session.step === "AWAITING_CATEGORY") {
        const cat = resolveCategory(trimmed, CATEGORIES);
        if (!cat) {
            await ctx.sendText(remoteJid, t("invalidCategory", userLang));
            return;
        }

        ctx.state.setCategory(remoteJid, cat.dbCategory);
        await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
        return;
    }

    if (session.step === "AWAITING_ITEM") {
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
                (i) => i.name.toLowerCase() === lower || i.name.toLowerCase().includes(lower)
            );
        }

        if (!selected) {
            await ctx.sendText(remoteJid, t("invalidItem", userLang));
            return;
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
        return;
    }

    if (session.step === "AWAITING_GAMERTAG") {
        const gamertag = trimmed;
        const isValidGamertag = /^[a-zA-Z0-9 _]{3,16}$/.test(gamertag);
        if (!isValidGamertag) {
            await ctx.sendText(remoteJid, t("invalidGamertag", userLang));
            return;
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
        return;
    }

    if (session.step === "AWAITING_CONFIRMATION") {
        // Check if user inputs voucher code
        const voucherMatch = trimmed.match(/^(?:voucher|kupon)\s*(.*)$/i);
        if (voucherMatch) {
            const code = voucherMatch[1]?.trim().toUpperCase();
            if (!code) {
                const hint = userLang === "en"
                    ? `💡 Please include the voucher code, e.g. *voucher SAVE10*`
                    : `💡 Mohon sertakan kode voucher ya kak, contoh: *voucher HEMAT*`;
                await ctx.sendText(remoteJid, hint);
                return;
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
            return;
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
                    `Please complete the payment within 15 minutes to avoid QRIS expiration. Thank you for shopping with ${config.STORE_NAME}! 🥰`
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
                    `Jangan transfer lewat dari 15 menit ya kak agar QRIS tidak kedaluwarsa. Terima kasih banyak sudah berbelanja di ${config.STORE_NAME}! 🥰`
                );

                const sent = await ctx.sendImage(remoteJid, qrisBuffer, invoice);
                const qrKey =
                    sent?.key ??
                    (sent?.id ? { id: sent.id, remoteJid, fromMe: true } : undefined);
                if (qrKey) {
                    ctx.state.setQrMessageKey(remoteJid, qrKey);
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
                const failMsg = userLang === "en"
                    ? `❌ Oops, failed to create order: ${errMsg}`
                    : `❌ Waduh, gagal membuat pesanan kak: ${errMsg}`;
                await ctx.sendText(remoteJid, failMsg);
            }
            return;
        }

        await ctx.sendText(remoteJid, t("confirmPrompt", userLang));
        return;
    }

    // Idle natural greeting check
    if (session.step === "IDLE" && isGreeting) {
        await ctx.sendText(remoteJid, t("greeting", userLang));
        return;
    }

    // Idle Category Selection (e.g. user sends "1", "2", "pets" directly from idle)
    if (session.step === "IDLE") {
        const cat = resolveCategory(trimmed, CATEGORIES);
        if (cat) {
            ctx.state.setCategory(remoteJid, cat.dbCategory);
            await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
            return;
        }
    }

    // Strict prefix commands
    if (!trimmed.startsWith("/")) {
        return;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    if (!cmd) return;
    const args = parts.slice(1);
    const lowerCmd = cmd.toLowerCase();

    switch (lowerCmd) {
        case "/menu":
        case "/katalog":
        case "/catalog":
        case "/beli":
        case "/buy": {
            const filterQuery = args.join(" ").trim();

            if (filterQuery) {
                const cat = resolveCategory(filterQuery, CATEGORIES);
                if (cat) {
                    ctx.state.setCategory(remoteJid, cat.dbCategory);
                    await sendCategoryOrderPoster(remoteJid, cat, ctx, userLang);
                    return;
                }

                // Invalid category filter
                if (userLang === "en") {
                    let errMsg = `Oops, category *${filterQuery}* was not found 😊\n\n`;
                    errMsg += `Please choose from the categories below:\n`;
                    CATEGORIES.forEach((c) => {
                        errMsg += `• *${c.id}*. ${c.displayName.replace(/^\d+\.\s*/, "")}\n`;
                    });
                    errMsg += `\nExample: */buy 2* or directly type *2*`;
                    await ctx.sendText(remoteJid, errMsg);
                } else {
                    let errMsg = `Waduh, kategori *${filterQuery}* tidak ditemukan nih kak 😊\n\n`;
                    errMsg += `Silakan pilih dari daftar kategori berikut ya:\n`;
                    CATEGORIES.forEach((c) => {
                        errMsg += `• *${c.id}*. ${c.displayName.replace(/^\d+\.\s*/, "")}\n`;
                    });
                    errMsg += `\nContoh: */beli 2* atau langsung ketik *2*`;
                    await ctx.sendText(remoteJid, errMsg);
                }
                return;
            }

            ctx.state.startBuyingFlow(remoteJid);
            const isMenu = lowerCmd === "/menu" || lowerCmd === "/katalog" || lowerCmd === "/catalog";
            await ctx.sendText(remoteJid, renderOrderCategoryMenu(isMenu, userLang));
            break;
        }

        case "/status": {
            const orderId = args[0];
            if (!orderId) {
                try {
                    const orders = await ctx.client.getUserOrders(remoteJid);
                    if (!orders || orders.length === 0) {
                        await ctx.sendText(remoteJid, t("emptyOrders", userLang));
                        return;
                    }

                    // Find active or latest order
                    const activeOrder = orders.find(
                        (o) =>
                            o.status === "PENDING_PAYMENT" ||
                            o.status === "QUEUED" ||
                            o.status === "GIFTING" ||
                            o.status === "INSUFFICIENT_TOKENS"
                    ) ?? orders[0];

                    if (!activeOrder) {
                        return;
                    }

                    await ctx.sendText(remoteJid, formatStatusText(activeOrder, ctx.adminNumber, userLang));
                } catch (err: unknown) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    await ctx.sendText(remoteJid, `❌ Gagal mengambil status pesanan kak: ${errMsg}`);
                }
                return;
            }

            try {
                const cleanId = orderId.replace(/^#/, "");
                const order = await ctx.client.getOrderStatus(cleanId);
                await ctx.sendText(remoteJid, formatStatusText(order, ctx.adminNumber, userLang));
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `❌ Tidak dapat menemukan pesanan #${orderId} nih kak: ${errMsg}`);
            }
            break;
        }

        case "/riwayat":
        case "/history": {
            try {
                const orders = await ctx.client.getUserOrders(remoteJid);
                if (!orders || orders.length === 0) {
                    const emptyMsg = userLang === "en"
                        ? `Hi there! You don't have any order history yet 😊\n\nStart shopping by typing */buy*!`
                        : `Halo kak! Belum ada riwayat pesanan untuk nomor ini nih 😊\n\nYuk mulai belanja dengan ketik */beli* ya!`;
                    await ctx.sendText(remoteJid, emptyMsg);
                    return;
                }

                const recent = orders.slice(0, 5);
                let out = userLang === "en"
                    ? `📜 *ORDER HISTORY*\nRecent orders in ${config.STORE_NAME}:\n\n`
                    : `📜 *RIWAYAT PESANAN KAKAK*\nDaftar pesanan terbaru di ${config.STORE_NAME}:\n\n`;

                recent.forEach((ord, idx) => {
                    const badge = formatStatusBadge(ord.status, userLang, ord.failureReason);
                    out += `${idx + 1}. *#${ord.id}* — ${badge}\n`;
                    out += `   📦 ${ord.itemName} (${ord.gamertag})\n`;
                    out += `   💰 ${formatRupiah(ord.totalNominal)}\n\n`;
                });

                out += userLang === "en"
                    ? `💡 _Type */status <ID>* to check details of a specific order._`
                    : `💡 _Ketik */status <ID>* untuk melihat detail status pesanan tertentu._`;

                await ctx.sendText(remoteJid, out);
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                await ctx.sendText(remoteJid, `❌ Gagal mengambil riwayat pesanan kak: ${errMsg}`);
            }
            break;
        }

        case "/faq":
        case "/tanya": {
            await ctx.sendText(remoteJid, t("faqMessage", userLang, { adminNumber: ctx.adminNumber }));
            break;
        }

        case "/admin": {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            if (!isAdmin) {
                await sendUnrecognizedCommand(remoteJid, cmd, userLang, ctx);
                return;
            }

            const cleanPhone = extractPhoneNumber(effectiveSender);
            const groupJid = ctx.adminLogger?.getGroupJid();
            const groupStatus = groupJid ? `✅ Terdaftar (${groupJid})` : `⚠️ Belum terdaftar (Ketik /setgroup di grup log)`;

            let out = `🛠️ *PANEL ADMIN ${config.STORE_NAME.toUpperCase()}*\n\n`;
            out += `👤 Status: *Terverifikasi Admin ✅*\n`;
            if (cleanPhone) out += `📱 Nomor: *+${cleanPhone}*\n`;
            out += `👥 Admin Group: *${groupStatus}*\n\n`;
            out += `*Daftar Perintah Admin:*\n`;
            out += `• */reprocess* : Proses ulang semua order tertahan\n`;
            out += `• */reprocess <ID>* : Proses ulang order tertentu\n`;
            out += `• */setgroup* : Daftarkan grup obrolan sebagai Admin Group\n`;
            out += `• */setdiskon <0-90>* : Ubah persentase diskon toko global\n`;
            out += `• */voucher* : Kelola kode voucher promo (list/create/delete)\n`;
            out += `• */status <ID>* : Cek detail status order manapun\n`;

            await ctx.sendText(remoteJid, out);
            break;
        }

        case "/setdiskon":
        case "/setdiscount": {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            if (!isAdmin) {
                await sendUnrecognizedCommand(remoteJid, cmd, userLang, ctx);
                return;
            }
            await handleSetDiscountCommand(remoteJid, args, ctx, userLang);
            break;
        }

        case "/voucher": {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            if (!isAdmin) {
                await sendUnrecognizedCommand(remoteJid, cmd, userLang, ctx);
                return;
            }
            await handleVoucherCommand(remoteJid, args, ctx, userLang);
            break;
        }

        case "/setgroup": {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            if (!isAdmin) {
                await sendUnrecognizedCommand(remoteJid, cmd, userLang, ctx);
                return;
            }
            const targetJid = args[0]?.trim();
            if (targetJid && targetJid.endsWith("@g.us")) {
                if (ctx.adminLogger) {
                    ctx.adminLogger.setGroupJid(targetJid);
                    await ctx.sendText(remoteJid, `✅ Berhasil mendaftarkan Admin Group: ${targetJid}`);
                }
            } else {
                await ctx.sendText(
                    remoteJid,
                    `💡 *CARA MENDAFTARKAN ADMIN GROUP*\n\n` +
                    `1. Masuk ke grup WhatsApp yang ingin dijadikan Admin Group\n` +
                    `2. Ketik */setgroup* langsung di dalam grup tersebut\n\n` +
                    `Atau ketik */setgroup <JID_GRUP>* (contoh: */setgroup 120363xxx@g.us*)`
                );
            }
            break;
        }

        case "/reprocess":
        case "/retry": {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);

            if (!isAdmin) {
                await sendUnrecognizedCommand(remoteJid, cmd, userLang, ctx);
                return;
            }

            await handleReprocessCommand(remoteJid, args, ctx);
            break;
        }

        case "/batal":
        case "/cancel": {
            ctx.state.clear(remoteJid);
            await ctx.sendText(remoteJid, t("noActiveOrderToCancel", userLang));
            break;
        }

        case "/bantuan":
        case "/help": {
            const isAdmin = isUserAdmin(remoteJid, fromMe, effectiveSender, ctx.adminNumber, ctx.adminLogger);
            await ctx.sendText(remoteJid, t("helpMessage", userLang, { adminNumber: ctx.adminNumber, isAdmin }));
            break;
        }

        default:
            await sendUnrecognizedCommand(remoteJid, cmd, userLang, ctx);
            break;
    }
}
