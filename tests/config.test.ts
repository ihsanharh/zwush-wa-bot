import { describe, expect, it } from "bun:test";
import { parseConfig } from "../src/config";

describe("Configuration Parser", () => {
    it("should parse defaults correctly", () => {
        const config = parseConfig({});
        expect(config.PORT).toBe(3001);
        expect(config.CORE_API_URL).toBe("http://localhost:3000");
        expect(config.WEBHOOK_SECRET).toBe("zwush_secret_key_123");
        expect(config.ADMIN_NUMBER).toBe("628123456789");
        expect(config.LOG_GROUP_NAME).toBe("ZwushLogs");
        expect(config.ADMIN_GROUP_NAME).toBe("ZwushAdmin");
    });

    it("should accept custom environment variables", () => {
        const config = parseConfig({
            PORT: "3005",
            CORE_API_URL: "http://core:3000",
            ADMIN_NUMBER: "628999999999",
            LOG_GROUP_NAME: "MyCustomLogs",
            ADMIN_GROUP_NAME: "MyCustomAdmin",
            WEBHOOK_SECRET: "custom_secret"
        });
        expect(config.PORT).toBe(3005);
        expect(config.CORE_API_URL).toBe("http://core:3000");
        expect(config.ADMIN_NUMBER).toBe("628999999999");
        expect(config.LOG_GROUP_NAME).toBe("MyCustomLogs");
        expect(config.ADMIN_GROUP_NAME).toBe("MyCustomAdmin");
        expect(config.WEBHOOK_SECRET).toBe("custom_secret");
    });
});
