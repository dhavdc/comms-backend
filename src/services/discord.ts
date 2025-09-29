import { config } from "@/utils/config";
import logger from "@/utils/logger";

const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1422023513006538886/78jeJBazdcV88QngfPGHhiccIqZuoaPGxIMgEu3F81LpIfook3QDjnz_3xk7sx69wNRZ";

export interface DiscordNotificationData {
    type: string;
    userId: string;
    productId?: string | undefined;
    transactionId?: string | undefined;
    environment?: string | undefined;
    price?: number | undefined;
    currency?: string | undefined;
}

class DiscordService {
    async sendAppStoreNotification(data: DiscordNotificationData): Promise<void> {
        try {
            const { type, userId, productId, transactionId, environment, price, currency } = data;
            const environmentText = environment || config.apple.environment;
            const envEmoji = environmentText === "Production" ? "🟢" : "🟡";

            let title = "";
            let color = 0;

            switch (type) {
                case "SUBSCRIBED":
                    title = "🎉 New Subscription";
                    color = 0x00ff00; // Green
                    break;
                case "DID_RENEW":
                    title = "🔄 Subscription Renewed";
                    color = 0x0099ff; // Blue
                    break;
                case "EXPIRED":
                case "DID_FAIL_TO_RENEW":
                    title = "❌ Subscription Expired";
                    color = 0xff6600; // Orange
                    break;
                case "REFUND":
                    title = "💸 Subscription Refunded";
                    color = 0xff0000; // Red
                    break;
                case "DID_CHANGE_RENEWAL_STATUS":
                    title = "⚙️ Renewal Status Changed";
                    color = 0xffff00; // Yellow
                    break;
                case "DID_CHANGE_RENEWAL_PREF":
                    title = "🔄 Renewal Preference Changed";
                    color = 0x9932cc; // Purple
                    break;
                default:
                    title = `📱 App Store Event: ${type}`;
                    color = 0x888888; // Gray
            }

            const embed = {
                title,
                color,
                fields: [
                    {
                        name: "Environment",
                        value: `${envEmoji} ${environmentText}`,
                        inline: true
                    },
                    {
                        name: "User ID",
                        value: userId,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            if (productId) {
                embed.fields.push({
                    name: "Product ID",
                    value: productId,
                    inline: true
                });
            }

            if (transactionId) {
                embed.fields.push({
                    name: "Transaction ID",
                    value: transactionId,
                    inline: false
                });
            }

            // Add price information if available
            if (price !== undefined && currency) {
                // Convert from milliunits to currency units (divide by 1000)
                const priceInUnits = price / 1000;
                const formattedPrice = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: currency,
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(priceInUnits);

                embed.fields.push({
                    name: "💰 Price",
                    value: formattedPrice,
                    inline: true
                });
            }

            const payload = {
                embeds: [embed]
            };

            const response = await fetch(DISCORD_WEBHOOK_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                logger.warn("Failed to send Discord notification:", {
                    status: response.status,
                    statusText: response.statusText
                });
            } else {
                logger.info("Discord notification sent successfully", { type, userId });
            }
        } catch (error) {
            logger.error("Error sending Discord notification:", error);
        }
    }
}

export const discordService = new DiscordService();