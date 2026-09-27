import type { Command, CommandContext } from "../types";
import { t } from "../../i18n";

export const supportCommand: Command = {
    name: "/support",
    aliases: ["/cs"],
    englishName: "/support",
    order: 70,
    description: "Minta bantuan live chat langsung dengan admin",
    descriptionEn: "Request direct live chat support with admin",
    execute: async ({ remoteJid, userLang, ctx }: CommandContext) => {
        const session = ctx.state.getSession(remoteJid);
        if (session.step === "LIVE_CHAT") {
            await ctx.sendText(remoteJid, t("support.alreadyActive", userLang));
            return;
        }

        if (session.step === "AWAITING_SUPPORT_CONFIRMATION") {
            await ctx.sendText(remoteJid, t("support.alreadyPrompted", userLang));
            return;
        }

        const retry = session.retryOrder || session.lastFailedOrder;
        let orderInfo: { orderId?: string; itemName?: string; gamertag?: string; attempts?: number } = {};

        if (retry) {
            orderInfo = {
                orderId: retry.orderId,
                itemName: retry.itemName,
                gamertag: (retry as any).newGamertag || (retry as any).oldGamertag || (retry as any).gamertag,
                attempts: retry.attempts
            };
        } else {
            try {
                const userOrders = await ctx.client.getUserOrders(remoteJid);
                if (userOrders && userOrders.length > 0 && userOrders[0]) {
                    const latest = userOrders[0];
                    orderInfo = {
                        orderId: latest.id,
                        itemName: latest.itemName,
                        gamertag: latest.gamertag
                    };
                }
            } catch {}
        }

        // Set state to AWAITING_SUPPORT_CONFIRMATION to ask user consent first
        ctx.state.requestSupportConsent(remoteJid, orderInfo.orderId);

        const consentPrompt = t("support.consentPrompt", userLang);
        await ctx.sendText(remoteJid, consentPrompt);
    },
};

export default supportCommand;
