import { describe, expect, it } from "bun:test";
import { generateCategoryPoster, getCachedPoster, wrapItemName } from "../src/poster";
import type { CatalogItem } from "../src/types";
import { CATEGORIES } from "../src/handlers/message";

describe("Category Poster Generator", () => {
    const makeItems = (count: number, category: string): CatalogItem[] => {
        return Array.from({ length: count }, (_, i) => ({
            id: String(i + 1),
            name: `Item ${i + 1}`,
            category,
            tokenCost: 5,
            minecoins: 330,
            originalPrice: 20000,
            rupiahPrice: 10000,
            discountPercent: 50,
            imageUrl: null,
            active: true
        }));
    };

    it("should generate a single poster PNG buffer for a category with 6 items", async () => {
        const cat = CATEGORIES[1]!; // Pets
        const items = makeItems(6, cat.dbCategory);
        const buffer = await generateCategoryPoster(cat, items);

        expect(buffer).toBeDefined();
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(1000);
        expect(buffer[0]).toBe(0x89);
        expect(buffer[1]).toBe(0x50);
        expect(buffer[2]).toBe(0x4e);
        expect(buffer[3]).toBe(0x47);
    });

    it("should generate a single unified poster containing all items even when count is large (e.g. 27 items)", async () => {
        const cat = CATEGORIES[3]!; // Hats (27 items)
        const items = makeItems(27, cat.dbCategory);
        const buffer = await generateCategoryPoster(cat, items);

        expect(buffer).toBeDefined();
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer[0]).toBe(0x89);
        expect(buffer[1]).toBe(0x50);
    });

    it("should retrieve cached poster on subsequent calls", async () => {
        const cat = CATEGORIES[3]!;
        const cached = getCachedPoster(cat.dbCategory);
        expect(cached).toBeDefined();
        expect(Buffer.isBuffer(cached)).toBe(true);
    });

    describe("wrapItemName", () => {
        it("keeps short item names on a single line", () => {
            const lines = wrapItemName("Dragon Pet", 16);
            expect(lines).toEqual(["Dragon Pet"]);
        });

        it("wraps long item names across two lines on word boundaries", () => {
            const lines = wrapItemName("Hive+ to Ultimate Upgrade", 16);
            expect(lines.length).toBe(2);
            expect(lines[0]).toBe("Hive+ to");
            expect(lines[1]).toBe("Ultimate Upgrade");
        });

        it("wraps Murder Mystery Starter Pack cleanly", () => {
            const lines = wrapItemName("Murder Mystery Starter Pack", 16);
            expect(lines.length).toBe(2);
            expect(lines[0]).toBe("Murder Mystery");
            expect(lines[1]).toBe("Starter Pack");
        });

        it("handles long single words without spaces", () => {
            const lines = wrapItemName("Supercalifragilisticexpialidocious", 16);
            expect(lines.length).toBe(2);
            expect(lines[0].length).toBeLessThanOrEqual(16);
        });

        it("successfully renders poster with long wrapped item names", async () => {
            const cat = CATEGORIES[0]!; // Main Store
            const items: CatalogItem[] = [
                {
                    id: "1",
                    name: "Hive+ to Ultimate Upgrade",
                    category: cat.dbCategory,
                    tokenCost: 11,
                    minecoins: 720,
                    originalPrice: 55000,
                    rupiahPrice: 27500,
                    discountPercent: 50,
                    imageUrl: null,
                    active: true
                },
                {
                    id: "2",
                    name: "Murder Mystery Starter Pack",
                    category: cat.dbCategory,
                    tokenCost: 15,
                    minecoins: 990,
                    originalPrice: 75000,
                    rupiahPrice: 37500,
                    discountPercent: 50,
                    imageUrl: null,
                    active: true
                }
            ];

            const buffer = await generateCategoryPoster(cat, items);
            expect(buffer).toBeDefined();
            expect(Buffer.isBuffer(buffer)).toBe(true);
            expect(buffer[0]).toBe(0x89);
            expect(buffer[1]).toBe(0x50);
        });
    });
});
