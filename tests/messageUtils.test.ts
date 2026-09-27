import { describe, expect, it } from "bun:test";
import {
    extractMessageText,
    extractPhoneNumber,
    isPrivateChat,
    extractEventTimestampSeconds,
    isEventStale,
    executeUserSequential
} from "../src/utils/messageUtils";

describe("Message Utilities", () => {
    describe("extractMessageText", () => {
        it("should extract conversation text", () => {
            const msg = { conversation: "Hello World" };
            expect(extractMessageText(msg)).toBe("Hello World");
        });

        it("should extract extendedTextMessage text", () => {
            const msg = { extendedTextMessage: { text: "Extended text" } };
            expect(extractMessageText(msg)).toBe("Extended text");
        });

        it("should extract image caption", () => {
            const msg = { imageMessage: { caption: "Look at this image" } };
            expect(extractMessageText(msg)).toBe("Look at this image");
        });

        it("should unwrap ephemeralMessage wrappers", () => {
            const msg = {
                ephemeralMessage: {
                    message: {
                        conversation: "Inside ephemeral"
                    }
                }
            };
            expect(extractMessageText(msg)).toBe("Inside ephemeral");
        });

        it("should return empty string on empty or invalid messages", () => {
            expect(extractMessageText(null)).toBe("");
            expect(extractMessageText({})).toBe("");
        });
    });

    describe("extractPhoneNumber", () => {
        it("should normalize Indonesian numbers starting with 08 to 628", () => {
            expect(extractPhoneNumber("08123456789@s.whatsapp.net")).toBe("628123456789");
        });

        it("should normalize Indonesian numbers starting with 8 to 628", () => {
            expect(extractPhoneNumber("8123456789@s.whatsapp.net")).toBe("628123456789");
        });

        it("should preserve numbers starting with 628", () => {
            expect(extractPhoneNumber("628123456789:0@s.whatsapp.net")).toBe("628123456789");
        });

        it("should return empty string for empty input", () => {
            expect(extractPhoneNumber("")).toBe("");
        });
    });

    describe("isPrivateChat", () => {
        it("should return true for @s.whatsapp.net and @lid", () => {
            expect(isPrivateChat("628123456789@s.whatsapp.net")).toBe(true);
            expect(isPrivateChat("123456789@lid")).toBe(true);
        });

        it("should return false for group, broadcast, and newsletter", () => {
            expect(isPrivateChat("123456-789@g.us")).toBe(false);
            expect(isPrivateChat("status@broadcast")).toBe(false);
            expect(isPrivateChat("123456@newsletter")).toBe(false);
        });
    });

    describe("extractEventTimestampSeconds & isEventStale", () => {
        it("should extract timestamp seconds from event", () => {
            const nowSec = Math.floor(Date.now() / 1000);
            expect(extractEventTimestampSeconds({ messageTimestamp: nowSec })).toBe(nowSec);
            expect(extractEventTimestampSeconds({ timestamp: nowSec * 1000 })).toBe(nowSec);
        });

        it("should detect fresh events (< 300s old)", () => {
            const nowSec = Math.floor(Date.now() / 1000);
            const check = isEventStale({ messageTimestamp: nowSec - 10 });
            expect(check.stale).toBe(false);
        });

        it("should detect stale events (> 300s old)", () => {
            const nowSec = Math.floor(Date.now() / 1000);
            const check = isEventStale({ messageTimestamp: nowSec - 350 });
            expect(check.stale).toBe(true);
        });
    });

    describe("executeUserSequential", () => {
        it("should execute tasks sequentially for same userKey", async () => {
            const order: number[] = [];
            const userKey = "user_test_seq";

            const p1 = executeUserSequential(userKey, async () => {
                await new Promise((r) => setTimeout(r, 20));
                order.push(1);
            });

            const p2 = executeUserSequential(userKey, async () => {
                order.push(2);
            });

            await Promise.all([p1, p2]);
            expect(order).toEqual([1, 2]);
        });
    });
});
