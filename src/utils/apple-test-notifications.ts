import {
    AppStoreServerAPIClient,
    Environment,
} from "@apple/app-store-server-library";
import { config } from "./config.js";
import logger from "./logger.js";

class AppleTestNotifications {
    private client: AppStoreServerAPIClient;
    private environment: Environment;

    constructor() {
        this.environment =
            config.apple.environment === "Production"
                ? Environment.PRODUCTION
                : Environment.SANDBOX;

        this.client = new AppStoreServerAPIClient(
            config.apple.privateKey,
            config.apple.keyId,
            config.apple.issuerId,
            config.apple.bundleId,
            this.environment
        );
    }

    /**
     * Request Apple to send a test notification to your webhook endpoint
     * This is the official way to test Apple webhooks
     */
    async requestTestNotification(): Promise<string | null> {
        try {
            logger.info("Requesting test notification from Apple...");

            // Request Apple to send a test notification
            const response = await this.client.requestTestNotification();

            if (response.testNotificationToken) {
                logger.info("Test notification requested successfully", {
                    testNotificationToken: response.testNotificationToken,
                });
                return response.testNotificationToken;
            } else {
                logger.error("No test notification token received");
                return null;
            }
        } catch (error) {
            logger.error("Failed to request test notification:", error);
            return null;
        }
    }

    /**
     * Check the status of a test notification
     */
    async getTestNotificationStatus(testNotificationToken: string) {
        try {
            const status = await this.client.getTestNotificationStatus(
                testNotificationToken
            );
            logger.info("Test notification status:", status);
            return status;
        } catch (error) {
            logger.error("Failed to get test notification status:", error);
            return null;
        }
    }
}

export const appleTestNotifications = new AppleTestNotifications();
