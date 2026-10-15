import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { CoreClient } from "../src/coreClient";

describe("CoreClient - User Profile & Preferences", () => {
    const client = new CoreClient("http://localhost:3000");
    const testJid = "628123456789@s.whatsapp.net";
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("should fetch user profile via getUserProfile", async () => {
        globalThis.fetch = mock(async (url: any, opts: any) => {
            expect(url.toString()).toContain(`/api/users/${encodeURIComponent(testJid)}`);
            return new Response(
                JSON.stringify({
                    success: true,
                    user: {
                        platformUserId: testJid,
                        platform: "whatsapp",
                        gamertag: "VioscaMC",
                        language: "id"
                    }
                }),
                { status: 200 }
            );
        });

        const profile = await client.getUserProfile(testJid);
        expect(profile).toBeDefined();
        expect(profile.platformUserId).toBe(testJid);
        expect(profile.gamertag).toBe("VioscaMC");
        expect(profile.language).toBe("id");
    });

    it("should update user profile via updateUserProfile", async () => {
        let capturedBody: any;
        globalThis.fetch = mock(async (url: any, opts: any) => {
            expect(opts.method).toBe("PUT");
            capturedBody = JSON.parse(opts.body);
            return new Response(
                JSON.stringify({
                    success: true,
                    user: {
                        platformUserId: testJid,
                        platform: "whatsapp",
                        gamertag: capturedBody.gamertag,
                        language: capturedBody.language || "id"
                    }
                }),
                { status: 200 }
            );
        });

        const updated = await client.updateUserProfile(testJid, {
            gamertag: "NewGamer",
            language: "en"
        });

        expect(capturedBody.gamertag).toBe("NewGamer");
        expect(capturedBody.language).toBe("en");
        expect(updated.gamertag).toBe("NewGamer");
        expect(updated.language).toBe("en");
    });

    it("should allow clearing gamertag with null in updateUserProfile", async () => {
        let capturedBody: any;
        globalThis.fetch = mock(async (url: any, opts: any) => {
            capturedBody = JSON.parse(opts.body);
            return new Response(
                JSON.stringify({
                    success: true,
                    user: {
                        platformUserId: testJid,
                        platform: "whatsapp",
                        gamertag: null,
                        language: "id"
                    }
                }),
                { status: 200 }
            );
        });

        const updated = await client.updateUserProfile(testJid, {
            gamertag: null
        });

        expect(capturedBody.gamertag).toBeNull();
        expect(updated.gamertag).toBeNull();
    });
});
