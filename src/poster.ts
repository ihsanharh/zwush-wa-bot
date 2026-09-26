import sharp from "sharp";
import type { CatalogItem } from "./types";
import type { CategoryDefinition } from "./handlers/message";
import { config } from "./config";

const posterCache = new Map<string, Buffer>();
const itemImageCache = new Map<string, Buffer>();

function formatRupiah(amount: number): string {
    return `Rp ${amount.toLocaleString("id-ID")}`;
}

function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "&": return "&amp;";
            case "'": return "&apos;";
            case "\"": return "&quot;";
            default: return c;
        }
    });
}

export function getCachedPoster(categoryDbName: string): Buffer | undefined {
    for (const [key, val] of posterCache.entries()) {
        if (key === categoryDbName || key.startsWith(`${categoryDbName}_`)) return val;
    }
    return undefined;
}

export function clearPosterCache(): void {
    posterCache.clear();
}

/**
 * Wraps an item name across up to 2 lines instead of truncating with ellipsis.
 */
export function wrapItemName(name: string, maxCharsPerLine = 16): string[] {
    const trimmed = name.trim();
    if (trimmed.length <= maxCharsPerLine) {
        return [trimmed];
    }

    const words = trimmed.split(/\s+/);
    if (words.length === 1) {
        return [trimmed.slice(0, maxCharsPerLine), trimmed.slice(maxCharsPerLine, maxCharsPerLine * 2)];
    }

    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length <= maxCharsPerLine) {
            currentLine = testLine;
        } else {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                lines.push(word.slice(0, maxCharsPerLine));
                currentLine = word.slice(maxCharsPerLine);
            }
        }
    }

    if (currentLine) {
        lines.push(currentLine);
    }

    if (lines.length > 2) {
        const first = lines[0];
        const rest = lines.slice(1).join(" ");
        const second = rest.length > maxCharsPerLine ? rest.slice(0, maxCharsPerLine - 1) + "…" : rest;
        return [first, second];
    }

    return lines;
}

/**
 * Resolves the image URL for an item, providing official The Hive CDN fallbacks
 * for categories that do not have dedicated avatar URLs (like Murder Mystery Packs).
 */
export function resolveItemImageUrl(item: { imageUrl?: string | null; category: string }): string | null {
    if (item.imageUrl) return item.imageUrl;
    if (item.category === "Murder Mystery Packs" || item.category === "Main Store") {
        return "https://cdn.playhive.com/icons/hub/gifts/bundles.png";
    }
    return null;
}

export async function getItemImageBuffer(imageUrl: string | null | undefined): Promise<Buffer | null> {
    if (!imageUrl) return null;
    const cached = itemImageCache.get(imageUrl);
    if (cached) return cached;

    try {
        const response = await fetch(imageUrl, {
            headers: {
                "User-Agent": `${config.STORE_NAME.replace(/\s+/g, "")}-Bot/1.0`
            }
        });
        if (!response.ok) return null;
        const arrayBuf = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        // Optimize and ensure valid PNG
        const pngBuffer = await sharp(buffer).resize(256, 256, { fit: "contain" }).png().toBuffer();
        itemImageCache.set(imageUrl, pngBuffer);
        return pngBuffer;
    } catch {
        return null;
    }
}

/**
 * Strips emoji characters from text to prevent broken font/glyph rendering in SVG/Sharp.
 */
export function stripEmojis(str: string): string {
    return str
        .replace(
            /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
            ""
        )
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{200D}\u{FE0F}]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

export async function generateCategoryPoster(
    category: CategoryDefinition,
    items: CatalogItem[]
): Promise<Buffer> {
    const activeItems = items.filter((i) => i.active && i.category === category.dbCategory);
    if (activeItems.length === 0) {
        throw new Error(`No active items for category: ${category.dbCategory}`);
    }

    const discountPercent = activeItems[0]?.discountPercent ?? 0;
    const cacheKey = `${category.dbCategory}_d${discountPercent}`;
    const cached = posterCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const cols = 3;
    const rows = Math.max(1, Math.ceil(activeItems.length / cols));
    const cardWidth = 260;
    const isCompact = activeItems.length > 12;
    const cardHeight = isCompact ? 125 : 140;
    const gap = isCompact ? 12 : 16;
    const padX = 25;
    const headerHeight = 120;
    const footerHeight = 60;

    const totalWidth = padX * 2 + (cols * cardWidth) + ((cols - 1) * gap);
    const totalHeight = headerHeight + (rows * cardHeight) + ((rows - 1) * gap) + footerHeight;

    const compositeImages: Array<{ input: Buffer; top: number; left: number; size: number }> = [];

    // Pre-fetch item images in parallel, with category fallback
    const itemBuffers = await Promise.all(
        activeItems.map(async (item) => {
            const url = resolveItemImageUrl(item);
            if (!url) return null;
            try {
                return await getItemImageBuffer(url);
            } catch {
                return null;
            }
        })
    );

    let cardsSvg = "";

    activeItems.forEach((item, idx) => {
        const globalIdx = idx + 1;
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const x = padX + c * (cardWidth + gap);
        const y = headerHeight + r * (cardHeight + gap);

        const imgBuffer = itemBuffers[idx];
        const hasImg = Boolean(imgBuffer);

        const boxSize = isCompact ? 60 : 66;
        const boxY = isCompact ? y + 30 : y + 35;
        const boxX = x + 12;
        const textStartX = isCompact ? x + 84 : x + 90;

        if (imgBuffer) {
            compositeImages.push({
                input: imgBuffer,
                top: boxY + 2,
                left: boxX + 2,
                size: boxSize - 4
            });
        }

        const maxChars = isCompact ? 15 : 16;
        const rawCleanName = stripEmojis(item.name);
        const nameLines = wrapItemName(rawCleanName || item.name, maxChars);

        let nameSvg = "";
        if (nameLines.length === 1) {
            const displayName = escapeXml(nameLines[0]);
            const nameY = y + (isCompact ? 42 : 46);
            const fontSize = isCompact ? 13 : 14;
            nameSvg = `<text x="${textStartX}" y="${nameY}" fill="#f8fafc" font-size="${fontSize}" font-weight="bold" font-family="sans-serif">${displayName}</text>`;
        } else {
            const line1 = escapeXml(nameLines[0]);
            const line2 = escapeXml(nameLines[1]);
            const line1Y = y + (isCompact ? 35 : 39);
            const line2Y = y + (isCompact ? 49 : 54);
            const fontSize = isCompact ? 11 : 12;
            nameSvg = `
            <text x="${textStartX}" y="${line1Y}" fill="#f8fafc" font-size="${fontSize}" font-weight="bold" font-family="sans-serif">${line1}</text>
            <text x="${textStartX}" y="${line2Y}" fill="#f8fafc" font-size="${fontSize}" font-weight="bold" font-family="sans-serif">${line2}</text>
            `;
        }

        // Voucher style % discount badge
        const itemDiscount = item.discountPercent > 0
            ? item.discountPercent
            : (item.originalPrice > item.rupiahPrice
                ? Math.round((1 - item.rupiahPrice / item.originalPrice) * 100)
                : 0);

        let voucherBadgeSvg = "";
        if (itemDiscount > 0) {
            const voucherW = 70;
            const voucherH = 20;
            const voucherX = x + cardWidth - voucherW - 10;
            const voucherY = y + 10;

            voucherBadgeSvg = `
            <!-- Voucher Style % Badge -->
            <g>
                <rect x="${voucherX}" y="${voucherY}" width="${voucherW}" height="${voucherH}" rx="4" fill="#dc2626" />
                <line x1="${voucherX + 18}" y1="${voucherY}" x2="${voucherX + 18}" y2="${voucherY + voucherH}" stroke="#991b1b" stroke-width="1.5" stroke-dasharray="2,2" />
                <text x="${voucherX + 9}" y="${voucherY + 14}" fill="#fecdd3" font-size="9" font-weight="bold" font-family="sans-serif" text-anchor="middle">%</text>
                <text x="${voucherX + 18 + (voucherW - 18) / 2}" y="${voucherY + 14}" fill="#ffffff" font-size="10.5" font-weight="bold" font-family="sans-serif" text-anchor="middle">-${itemDiscount}%</text>
            </g>
            `;
        }

        cardsSvg += `
        <g>
            <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
            <!-- Badge with item number -->
            <rect x="${x + 10}" y="${y + 10}" width="${globalIdx >= 10 ? 44 : 36}" height="20" rx="5" fill="#0284c7" />
            <text x="${x + 10 + (globalIdx >= 10 ? 22 : 18)}" y="${y + 24}" fill="#ffffff" font-size="11" font-weight="bold" font-family="sans-serif" text-anchor="middle">#${globalIdx}</text>

            ${voucherBadgeSvg}

            <!-- Icon Box Container (consistent across all items) -->
            <rect x="${boxX}" y="${boxY}" width="${boxSize}" height="${boxSize}" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1.2" />

            ${!hasImg ? `
            <!-- Fallback Clean Vector Gift Box (independent of OS fonts/emojis) -->
            <g transform="translate(${boxX + (isCompact ? 8 : 10)}, ${boxY + (isCompact ? 8 : 10)}) scale(${isCompact ? 0.8 : 0.9})">
                <rect x="4" y="16" width="36" height="24" rx="3" fill="#0284c7" />
                <rect x="1" y="10" width="42" height="8" rx="2" fill="#38bdf8" />
                <rect x="18" y="10" width="8" height="30" fill="#fbbf24" />
                <path d="M 14 10 C 10 2, 21 2, 22 10 C 23 2, 34 2, 30 10" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" />
            </g>
            ` : ""}

            <!-- Item Name (supports 1 or 2 lines) -->
            ${nameSvg}

            <!-- Original Price -->
            <text x="${textStartX}" y="${y + (isCompact ? 66 : 73)}" fill="#94a3b8" font-size="11" font-family="sans-serif" text-decoration="line-through">${formatRupiah(item.originalPrice)}</text>

            <!-- Rupiah Price Promo -->
            <rect x="${textStartX - 2}" y="${y + (isCompact ? 76 : 85)}" width="130" height="${isCompact ? 22 : 24}" rx="5" fill="#14532d" />
            <text x="${textStartX + 8}" y="${y + (isCompact ? 92 : 102)}" fill="#4ade80" font-size="13" font-weight="bold" font-family="sans-serif">${formatRupiah(item.rupiahPrice)}</text>
        </g>
        `;
    });

    const rawCategoryName = category.displayName.replace(/^\d+\.\s*/, "");
    const cleanCategoryName = stripEmojis(rawCategoryName).toUpperCase();
    const categoryTitle = escapeXml(cleanCategoryName || category.dbCategory.toUpperCase());
    const storeCleanName = escapeXml(stripEmojis(config.STORE_NAME).toUpperCase() || config.STORE_NAME.toUpperCase());

    const svg = `
    <svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#090d16" />
                <stop offset="100%" stop-color="#0f172a" />
            </linearGradient>
            <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#38bdf8" />
                <stop offset="100%" stop-color="#818cf8" />
            </linearGradient>
        </defs>

        <!-- Background -->
        <rect width="${totalWidth}" height="${totalHeight}" fill="url(#bgGrad)" />

        <!-- Top Accent Bar -->
        <rect x="0" y="0" width="${totalWidth}" height="5" fill="url(#headerGrad)" />

        <!-- Header -->
        <g transform="translate(${padX}, 25)">
            <rect x="0" y="0" width="180" height="22" rx="11" fill="#0369a1" />
            <text x="90" y="15" fill="#e0f2fe" font-size="10" font-weight="bold" font-family="sans-serif" text-anchor="middle">THE HIVE BEDROCK STORE</text>
            
            <text x="0" y="48" fill="#f8fafc" font-size="22" font-weight="bold" font-family="sans-serif">${storeCleanName} — ${categoryTitle}</text>
            <text x="0" y="70" fill="#94a3b8" font-size="13" font-family="sans-serif">${discountPercent > 0 ? `Diskon s/d ${discountPercent}% • Pengiriman Cepat • QRIS Otomatis (${activeItems.length} Item)` : `Harga Spesial • Pengiriman Cepat • QRIS Otomatis (${activeItems.length} Item)`}</text>
        </g>

        <!-- Divider -->
        <line x1="${padX}" y1="108" x2="${totalWidth - padX}" y2="108" stroke="#334155" stroke-width="1.5" />

        <!-- Item Cards -->
        ${cardsSvg}

        <!-- Footer -->
        <g transform="translate(0, ${totalHeight - footerHeight})">
            <rect width="${totalWidth}" height="${footerHeight}" fill="#030712" />
            <line x1="0" y1="0" x2="${totalWidth}" y2="0" stroke="#1e293b" stroke-width="1" />
            <text x="${totalWidth / 2}" y="28" fill="#38bdf8" font-size="14" font-weight="bold" font-family="sans-serif" text-anchor="middle">
                Ketik nomor item (contoh: 1) atau ketik /beli untuk memesan via WhatsApp
            </text>
            <text x="${totalWidth / 2}" y="47" fill="#64748b" font-size="11" font-family="sans-serif" text-anchor="middle">
                ${escapeXml(stripEmojis(config.STORE_NAME) || config.STORE_NAME)} • Layanan Resmi &amp; Terpercaya
            </text>
        </g>
    </svg>
    `;

    const resizedComposites: Array<{ input: Buffer; top: number; left: number }> = [];
    for (const comp of compositeImages) {
        try {
            const resized = await sharp(comp.input).resize(comp.size, comp.size, { fit: "contain" }).png().toBuffer();
            resizedComposites.push({
                input: resized,
                top: comp.top,
                left: comp.left
            });
        } catch {
            // Ignore if image fails
        }
    }

    const basePng = await sharp(Buffer.from(svg)).png().toBuffer();
    const finalBuffer = resizedComposites.length > 0
        ? await sharp(basePng).composite(resizedComposites).png().toBuffer()
        : basePng;

    posterCache.set(cacheKey, finalBuffer);
    return finalBuffer;
}

export async function generateCategoryPosters(
    category: CategoryDefinition,
    items: CatalogItem[]
): Promise<Buffer[]> {
    const poster = await generateCategoryPoster(category, items);
    return [poster];
}

export function getCachedPosters(categoryDbName: string): Buffer[] | undefined {
    const cached = getCachedPoster(categoryDbName);
    return cached ? [cached] : undefined;
}
