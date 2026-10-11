import { describe, expect, it } from "bun:test";
import { parseConfig } from "../src/config";

describe("Configuration Parser", () => {
    it("should parse defaults correctly", () => {
        const config = parseConfig({});
        expect(config.PORT).toBe(3001);
        expect(config.CORE_API_URL).toBe("http://localhost:3000");
        expect(config.AUTH_PATH).toBe("./.auth/state.sqlite");
        expect(config.WEBHOOK_SECRET).toBe("zwush_secret_key_123");
        expect(config.LOG_GROUP_NAME).toBe("ZwushLogs");
        expect(config.ADMIN_GROUP_NAME).toBe("ZwushAdmin");
        expect(config.MAINTENANCE_MODE).toBe(false);
    });

    it("should accept custom environment variables", () => {
        const config = parseConfig({
            PORT: "3005",
            CORE_API_URL: "http://core:3000",
            AUTH_PATH: "./.auth_test/state.sqlite",
            LOG_GROUP_NAME: "MyCustomLogs",
            ADMIN_GROUP_NAME: "MyCustomAdmin",
            WEBHOOK_SECRET: "custom_secret",
            MAINTENANCE_MODE: "true"
        });
        expect(config.PORT).toBe(3005);
        expect(config.CORE_API_URL).toBe("http://core:3000");
        expect(config.AUTH_PATH).toBe("./.auth_test/state.sqlite");
        expect(config.LOG_GROUP_NAME).toBe("MyCustomLogs");
        expect(config.ADMIN_GROUP_NAME).toBe("MyCustomAdmin");
        expect(config.WEBHOOK_SECRET).toBe("custom_secret");
        expect(config.MAINTENANCE_MODE).toBe(true);
    });
});
