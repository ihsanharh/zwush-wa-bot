import { z } from "zod";

export const configSchema = z.object({
    PORT: z.coerce.number().default(3001),
    CORE_API_URL: z.string().default("http://localhost:3000"),
    STORE_NAME: z.string().default("Zwush Store"),
    ADMIN_NUMBER: z.string().default("628123456789"),
    LOG_GROUP_JID: z.string().optional().default(""),
    LOG_GROUP_NAME: z.string().default("ZwushLogs"),
    ADMIN_GROUP_JID: z.string().optional().default(""),
    ADMIN_GROUP_NAME: z.string().default("ZwushAdmin"),
    WEBHOOK_SECRET: z.string().default("zwush_secret_key_123")
});

export type BotConfig = z.infer<typeof configSchema>;

export function parseConfig(env: Record<string, string | undefined>): BotConfig {
    return configSchema.parse({
        PORT: env.PORT,
        CORE_API_URL: env.CORE_API_URL,
        STORE_NAME: env.STORE_NAME,
        ADMIN_NUMBER: env.ADMIN_NUMBER,
        LOG_GROUP_JID: env.LOG_GROUP_JID,
        LOG_GROUP_NAME: env.LOG_GROUP_NAME,
        ADMIN_GROUP_JID: env.ADMIN_GROUP_JID,
        ADMIN_GROUP_NAME: env.ADMIN_GROUP_NAME,
        WEBHOOK_SECRET: env.WEBHOOK_SECRET
    });
}

export const config = parseConfig(process.env);
