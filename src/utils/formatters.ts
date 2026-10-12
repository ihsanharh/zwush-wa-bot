import { formatStatusBadge, formatRupiah, t, type Language } from "../i18n";
import { generateCategoryPoster, getItemImageBuffer } from "../poster";
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
    return t("status.card", lang, {
        orderId: order.id,
        itemName: order.itemName,
        gamertag: order.gamertag,
        badge,
        totalFormatted: formatRupiah(order.totalNominal)
    });
}

export function renderOrderCategoryMenu(
    lang: Language = "id",
    discountPercent: number = currentStoreDiscount
): string {
    const discountLine = discountPercent > 0
        ? t("menu.categoryMenuDiscountLine", lang, { discount: discountPercent })
        : t("menu.categoryMenuSpecialLine", lang);

    let out = t("menu.categoryMenuHeader", lang, { discountLine });
    CATEGORIES.forEach((cat) => {
        out += `*${cat.id}.* ${cat.displayName.replace(/^\d+\.\s*/, "")}\n`;
    });
    out += t("menu.categoryMenuFooter", lang);
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
        await ctx.sendText(remoteJid, t("buying.categoryEmptyFallback", lang, { categoryName: cat.displayName }));
        return;
    }

    if (cat.dbCategory === "Regular Costume") {
        const costumeBannerUrl = "https://cdn.playhive.com/icons/hub/gifts/costumes.png";
        let bannerBuffer: Buffer | null = null;
        try {
            bannerBuffer = await getItemImageBuffer(costumeBannerUrl);
        } catch {
            bannerBuffer = null;
        }

        const costumeMsg = t("catalog.costumesPrompt", lang, {
            count: categoryItems.length,
            price: formatRupiah(categoryItems[0]?.rupiahPrice ?? 20000)
        });

        if (bannerBuffer) {
            await ctx.sendImage(remoteJid, bannerBuffer, costumeMsg);
        } else {
            await ctx.sendText(remoteJid, costumeMsg);
        }
        return;
    }

    const discountPercent = categoryItems[0]?.discountPercent ?? currentStoreDiscount;

    const caption = discountPercent > 0
        ? t("buying.selectItemCaptionDiscount", lang, {
            categoryName: cat.displayName.toUpperCase(),
            count: categoryItems.length,
            discount: discountPercent
        })
        : t("buying.selectItemCaptionSpecial", lang, {
            categoryName: cat.displayName.toUpperCase(),
            count: categoryItems.length
        });

    try {
        const posterBuffer = await generateCategoryPoster(cat, catalog, lang);
        await ctx.sendImage(remoteJid, posterBuffer, caption);
        return;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Category Poster Error]:", msg);
    }

    // Fallback to text if poster fails
    let out = t("buying.selectItemTextHeader", lang, { categoryName: cat.displayName.toUpperCase() });

    categoryItems.forEach((item, idx) => {
        out += t("menu.textCatalogItemLinePlain", lang, {
            idx: idx + 1,
            name: item.name,
            originalPrice: formatRupiah(item.originalPrice),
            rupiahPrice: formatRupiah(item.rupiahPrice)
        });
    });

    out += t("buying.selectItemTextPrompt", lang, { count: categoryItems.length });
    await ctx.sendText(remoteJid, out);
}
