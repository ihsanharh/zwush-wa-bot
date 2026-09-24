import { describe, expect, it } from "bun:test";
import { generateQrisBuffer } from "../src/qr";

describe("QRIS Buffer Generator", () => {
    it("should generate a valid PNG buffer from string", async () => {
        const dummyQris = "00020101021226570014ID.CO.QRIS.WWW5802ID5909ZwushStore6304ABCD";
        const buffer = await generateQrisBuffer(dummyQris);
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(100);
        // PNG header magic bytes: 0x89, 0x50, 0x4E, 0x47
        expect(buffer[0]).toBe(0x89);
        expect(buffer[1]).toBe(0x50);
        expect(buffer[2]).toBe(0x4E);
        expect(buffer[3]).toBe(0x47);
    });

    it("should reject empty strings", () => {
        expect(generateQrisBuffer("")).rejects.toThrow("QRIS string cannot be empty");
    });
});
