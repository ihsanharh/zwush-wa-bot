import { config } from "../config";
import { formatStatusBadge, formatRupiah, type Language } from "../i18n";
import { generateCategoryPoster } from "../poster";
import type { CatalogItem } from "../types";
import type { BotContext } from "../handlers/message";
import { CATEGORIES, type CategoryDefinition, currentStoreDiscount } from "./categories";

export function formatStatusText(
    order: {
        id: string;
        itemName: string;
        gamertag: string;
        status: string;
        totalNominal: number;
        failureReason?: string | null;
    },
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
            `Any questions? Please contact our store admin team.`
        );
    }
    return (
        `🔍 *STATUS PESANAN #${order.id}*\n\n` +
        `📦 Item: *${order.itemName}*\n` +
        `👤 Gamertag: *${order.gamertag}*\n` +
        `📊 Status: *${badge}*\n` +
        `💰 Total: *${formatRupiah(order.totalNominal)}*\n\n` +
        `Ada pertanyaan kak? Silakan hubungi tim admin kami di grup toko.`
    );
}

export function renderOrderCategoryMenu(
    lang: Language = "id",
    discountPercent: number = currentStoreDiscount
): string {
    const discLineEn = discountPercent > 0
        ? `> Official cosmetics discount up to ${discountPercent}% for The Hive! ✨\n\n`
        : `> Official cosmetics for The Hive with special prices! ✨\n\n`;

    const discLineId = discountPercent > 0
        ? `> Diskon resmi s/d ${discountPercent}% untuk kosmetik The Hive! ✨\n\n`
        : `> Kosmetik resmi The Hive dengan harga spesial! ✨\n\n`;

    if (lang === "en") {
        let out = `🛍️ *${config.STORE_NAME.toUpperCase()} — CATALOG & ORDERING*\n`;
        out += discLineEn;
        out += `Hello! What cosmetics are you looking for today? Please choose a category below:\n\n`;
        CATEGORIES.forEach((cat) => {
            out += `*${cat.id}.* ${cat.displayName.replace(/^\d+\.\s*/, "")}\n`;
        });
        out += `\n💡 _Type the category number (*1 - 6*) to view catalog & order._\n`;
        out += `❌ _Type *c* or *cancel* to exit._`;
        return out;
    }

    let out = `🛍️ *${config.STORE_NAME.toUpperCase()} — KATALOG & PEMESANAN*\n`;
    out += discLineId;
    out += `Halo kak! Mau cari kosmetik apa hari ini? Silakan pilih kategori di bawah ya:\n\n`;
    CATEGORIES.forEach((cat) => {
        out += `*${cat.id}.* ${cat.displayName.replace(/^\d+\.\s*/, "")}\n`;
    });
    out += `\n💡 _Ketik nomor kategori (*1 - 6*) untuk melihat katalog & memesan._\n`;
    out += `❌ _Ketik *b* atau *batal* untuk keluar._`;
    return out;
}

export function renderMainMenu(lang: Language = "id"): string {
    return renderOrderCategoryMenu(lang);
}

export function renderCategoryItems(items: CatalogItem[], category: CategoryDefinition, lang: Language = "id"): string {
    const active = items.filter((i) => i.active && i.category === category.dbCategory);

    if (active.length === 0) {
        return lang === "en"
            ? `⚠️ No active items in category *${category.displayName}* yet.`
            : `⚠️ Belum ada item aktif di kategori *${category.displayName}* nih kak.`;
    }

    const discountPercent = active[0]?.discountPercent ?? currentStoreDiscount;

    if (lang === "en") {
        let out = `📁 *CATALOG: ${category.displayName.toUpperCase()}* (${active.length} Items)\n`;
        out += discountPercent > 0
            ? `Official store discount up to ${discountPercent}%! ⚡\n\n`
            : `Official store special prices! ⚡\n\n`;

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
    out += discountPercent > 0
        ? `Harga resmi diskon hingga ${discountPercent}%! ⚡\n\n`
        : `Harga promo resmi The Hive! ⚡\n\n`;

    active.forEach((item, idx) => {
        out += `${idx + 1}. *${item.name}*\n`;
        out += `   ~${formatRupiah(item.originalPrice)}~ ➔ *${formatRupiah(item.rupiahPrice)}* (Diskon ${item.discountPercent}%)\n`;
    });

    out += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    out += `Ketik nomor item (*1 - ${active.length}*) untuk membeli item ini ya kak!\n`;
    out += `Ketik *k* untuk kembali ke kategori, atau *b* untuk batal.`;
    return out;
}

export async function sendCategoryOrderPoster(
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

    const discountPercent = categoryItems[0]?.discountPercent ?? currentStoreDiscount;

    const caption = lang === "en" ? (
        `🛒 *CATALOG: ${cat.displayName.toUpperCase()}*\n\n` +
        (discountPercent > 0
            ? `There are *${categoryItems.length} awesome items* with up to ${discountPercent}% discount! ⚡\n\n`
            : `There are *${categoryItems.length} awesome items* ready for order! ⚡\n\n`) +
        `Please type the *item number* (*1 - ${categoryItems.length}*) from the image above that you'd like to buy:\n` +
        `• Type *b* to return to category list\n` +
        `• Type *c* to cancel order`
    ) : (
        `🛒 *KATALOG: ${cat.displayName.toUpperCase()}*\n\n` +
        (discountPercent > 0
            ? `Ada *${categoryItems.length} item* kece dengan diskon s/d ${discountPercent}%! ⚡\n\n`
            : `Ada *${categoryItems.length} item* kece siap diorder! ⚡\n\n`) +
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
