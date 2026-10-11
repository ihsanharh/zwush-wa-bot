import { z } from "zod";

export const configSchema = z.object({
    PORT: z.coerce.number().default(3001),
    CORE_API_URL: z.string().default("http://localhost:3000"),
    STORE_NAME: z.string().default("Zwush Store"),
    AUTH_PATH: z.string().default("./.auth/state.sqlite"),
    LOG_GROUP_JID: z.string().optional().default(""),
    LOG_GROUP_NAME: z.string().default("ZwushLogs"),
    ADMIN_GROUP_JID: z.string().optional().default(""),
    ADMIN_GROUP_NAME: z.string().default("ZwushAdmin"),
    WEBHOOK_SECRET: z.string().default("zwush_secret_key_123"),
    MAINTENANCE_MODE: z.preprocess((val) => {
        if (typeof val === "string") {
            return val.toLowerCase() === "true" || val === "1";
        }
        if (typeof val === "boolean") {
            return val;
        }
        return true;
    }, z.boolean()).default(true)
});

export type BotConfig = z.infer<typeof configSchema>;

export function parseConfig(env: Record<string, string | undefined>): BotConfig {
    return configSchema.parse({
        PORT: env.PORT,
        CORE_API_URL: env.CORE_API_URL,
        STORE_NAME: env.STORE_NAME,
        AUTH_PATH: env.AUTH_PATH,
        LOG_GROUP_JID: env.LOG_GROUP_JID,
        LOG_GROUP_NAME: env.LOG_GROUP_NAME,
        ADMIN_GROUP_JID: env.ADMIN_GROUP_JID,
        ADMIN_GROUP_NAME: env.ADMIN_GROUP_NAME,
        WEBHOOK_SECRET: env.WEBHOOK_SECRET,
        MAINTENANCE_MODE: env.MAINTENANCE_MODE
    });
}

export const config = parseConfig(process.env);
