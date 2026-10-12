export interface CategoryDefinition {
    id: string;
    displayName: string;
    dbCategory: string;
    displayPrice?: string;
}

export const CATEGORIES: CategoryDefinition[] = [
    { id: "1", displayName: "1. 👑 Ranks, Bundles & Tiket", dbCategory: "Main Store" },
    { id: "2", displayName: "2. 🐾 Pets", dbCategory: "Regular Pet" },
    { id: "3", displayName: "3. 🦄 Mounts", dbCategory: "Regular Mount" },
    { id: "4", displayName: "4. 🎩 Hats", dbCategory: "Hats" },
    { id: "5", displayName: "5. 🎒 Back Blings", dbCategory: "Back Blings" },
    { id: "6", displayName: "6. 🔪 Murder Mystery Packs", dbCategory: "Murder Mystery Packs" },
    { id: "7", displayName: "7. 🦹 Costumes", dbCategory: "Regular Costume" }
];

export let currentStoreDiscount = 50;

export function resolveCategory(input: string, categories: CategoryDefinition[]): CategoryDefinition | undefined {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return undefined;

    // Check by number ID (e.g. "1", "2")
    const byId = categories.find((c) => c.id === trimmed);
    if (byId) return byId;

    // Check by number prefix (e.g. "1." or "1. 👑 ...", "2 - Pets", "3) Mounts")
    const matchNumber = trimmed.match(/^(\d+)(?:[.\s\-)\]]|$)/);
    if (matchNumber && matchNumber[1]) {
        const byMatchId = categories.find((c) => c.id === matchNumber[1]);
        if (byMatchId) return byMatchId;
    }

    // Require at least 3 characters for non-numeric category text matching.
    if (trimmed.length < 3) {
        return undefined;
    }

    // Check by substring in displayName or dbCategory
    return categories.find(
        (c) =>
            c.displayName.toLowerCase().includes(trimmed) ||
            c.dbCategory.toLowerCase().includes(trimmed) ||
            trimmed.includes(c.dbCategory.toLowerCase())
    );
}

export function findCategory(identifier: string | null | undefined): CategoryDefinition | undefined {
    if (!identifier) return undefined;
    const clean = identifier.replace(/^cat_/, "").trim();
    if (!clean) return undefined;
    return (
        CATEGORIES.find(
            (c) =>
                c.dbCategory.toLowerCase() === clean.toLowerCase() ||
                String(c.id) === clean ||
                c.displayName.toLowerCase().includes(clean.toLowerCase())
        ) || resolveCategory(clean, CATEGORIES)
    );
}

