import {
    AppStoreServerAPIClient,
    Environment,
    SignedDataVerifier,
    ReceiptUtility,
    JWSTransactionDecodedPayload,
    JWSRenewalInfoDecodedPayload,
    Order,
    TransactionHistoryRequest,
    ProductType,
} from "@apple/app-store-server-library";
import { config } from "@/utils/config";
import logger from "@/utils/logger";
import {
    ValidationRequest,
    ValidationResponse,
    WebhookNotification,
    SUBSCRIPTION_PRODUCTS,
} from "@/types";
import { databaseService } from "./database";
import { discordService } from "./discord";
import fs from "fs";

class AppStoreService {
    private client: AppStoreServerAPIClient;
    private verifier: SignedDataVerifier;
    private environment: Environment;

    constructor() {
        this.environment =
            config.apple.environment === "Production"
                ? Environment.PRODUCTION
                : Environment.SANDBOX;

        // Initialize the App Store Server API client
        this.client = new AppStoreServerAPIClient(
            config.apple.privateKey,
            config.apple.keyId,
            config.apple.issuerId,
            config.apple.bundleId,
            this.environment
        );

        // Initialize the verifier for webhook signatures and transaction validation
        // Pass empty array for root certs - will use Apple's built-in certificates
        let appleCertificates: Buffer[] = [];
        appleCertificates.push(
            fs.readFileSync("./certificates/AppleRootCA-G3.cer")
        );
        this.verifier = new SignedDataVerifier(
            appleCertificates, // Apple root certificates (empty array uses built-in certs)
            true, // Enable online checks
            this.environment,
            config.apple.bundleId
        );
    }

    async validateReceipt(
        request: ValidationRequest
    ): Promise<ValidationResponse> {
        try {
            logger.info("Validating receipt for user:", {
                userId: request.userId,
                productId: request.productId,
                transactionId: request.transactionId,
            });

            // For new purchases, validate the receipt data directly
            if (request.purchaseToken) {
                try {
                    console.log("request.purchaseToken", request.purchaseToken);
                    // Validate the receipt data (JWS signature from iOS)
                    const decodedTransaction =
                        await this.verifier.verifyAndDecodeTransaction(
                            request.purchaseToken
                        );
                    console.log("decodedTransaction", decodedTransaction);

                    if (decodedTransaction) {
                        // Verify that the transaction belongs to the requesting user
                        if (
                            decodedTransaction.appAccountToken !==
                            request.userId
                        ) {
                            logger.warn("Transaction ownership mismatch", {
                                requestUserId: request.userId,
                                transactionAppAccountToken:
                                    decodedTransaction.appAccountToken,
                                transactionId:
                                    decodedTransaction.originalTransactionId,
                            });
                            return {
                                success: false,
                                subscriptionActive: false,
                                error: "Transaction does not belong to this user",
                            };
                        }

                        logger.info("Successfully validated receipt directly");
                        const isActive =
                            this.isSubscriptionActive(decodedTransaction);

                        // Store the subscription record in database
                        if (
                            isActive &&
                            decodedTransaction.originalTransactionId
                        ) {
                            const subscriptionRecord = {
                                user_id: request.userId,
                                product_id: request.productId,
                                transaction_id:
                                    decodedTransaction.originalTransactionId,
                                environment:
                                    request.environment ||
                                    config.apple.environment,
                                purchased_at: new Date(
                                    decodedTransaction.purchaseDate ||
                                        Date.now()
                                ).toISOString(),
                            };

                            await databaseService.insertSubscriptionRecord(
                                subscriptionRecord
                            );
                            await databaseService.updateUserSubscriptionStatus(
                                request.userId,
                                true
                            );
                            await databaseService.setHasPurchasedSubscriptionBefore(
                                request.userId
                            );
                        }

                        return {
                            success: true,
                            subscriptionActive: isActive,
                            transactionId:
                                decodedTransaction.originalTransactionId ||
                                undefined,
                            expiresDate: decodedTransaction.expiresDate
                                ? new Date(
                                      decodedTransaction.expiresDate
                                  ).toISOString()
                                : undefined,
                        };
                    }
                } catch (receiptError) {
                    logger.warn(
                        "Direct receipt validation failed, trying transaction history:",
                        receiptError
                    );
                }
            }
            return {
                success: false,
                subscriptionActive: false,
                error: "No receipt data provided",
            };
        } catch (error) {
            logger.error("Error validating receipt:", error);
            return {
                success: false,
                subscriptionActive: false,
                error: "Error validating receipt",
            };
        }
    }

    async handleWebhookNotification(signedPayload: string): Promise<boolean> {
        try {
            // Verify and decode the webhook notification
            const decodedNotification =
                await this.verifier.verifyAndDecodeNotification(signedPayload);

            if (!decodedNotification) {
                logger.error("Failed to decode webhook notification");
                return false;
            }

            logger.info("Processing webhook notification:", {
                type: decodedNotification.notificationType,
                subtype: decodedNotification.subtype,
            });

            return await this.processNotification(
                decodedNotification as WebhookNotification
            );
        } catch (error) {
            logger.error("Webhook processing failed:", error);
            return false;
        }
    }

    private async processNotification(
        notification: WebhookNotification
    ): Promise<boolean> {
        const { notificationType, subtype, data } = notification;

        if (!data?.signedTransactionInfo) {
            logger.warn("Notification missing transaction info");
            return false;
        }

        try {
            logger.info(notification);
            // Decode the transaction info
            const decodedTransaction =
                await this.verifier.verifyAndDecodeTransaction(
                    data.signedTransactionInfo
                );

            if (!decodedTransaction) {
                logger.error("Failed to decode transaction from notification");
                return false;
            }

            logger.info(decodedTransaction);

            // Find the user associated with this transaction
            const existingSubscription =
                await databaseService.getSubscriptionByTransactionId(
                    decodedTransaction.originalTransactionId || ""
                );

            if (!existingSubscription) {
                logger.warn(
                    "No existing subscription found for transaction:",
                    decodedTransaction.originalTransactionId
                );
                return false;
            }

            const userId = existingSubscription.user_id;

            // Handle different notification types
            switch (notificationType) {
                case "SUBSCRIBED":
                    await this.handleSubscriptionActivated(
                        userId,
                        decodedTransaction
                    );
                    break;

                case "DID_RENEW":
                    await this.handleSubscriptionRenewed(
                        userId,
                        decodedTransaction
                    );
                    break;

                case "EXPIRED":
                case "DID_FAIL_TO_RENEW":
                    await this.handleSubscriptionExpired(
                        userId,
                        decodedTransaction
                    );
                    break;

                case "DID_CHANGE_RENEWAL_STATUS":
                    await this.handleRenewalStatusChange(
                        userId,
                        decodedTransaction,
                        notification
                    );
                    break;

                case "REFUND":
                    await this.handleRefund(userId, decodedTransaction);
                    break;

                default:
                    logger.info(
                        "Unhandled notification type:",
                        notificationType
                    );
            }

            return true;
        } catch (error) {
            logger.error("Error processing notification:", error);
            return false;
        }
    }

    private async handleSubscriptionActivated(
        userId: string,
        transaction: JWSTransactionDecodedPayload
    ): Promise<void> {
        logger.info("Subscription activated:", {
            userId,
            transactionId: transaction.originalTransactionId,
        });

        await databaseService.updateUserSubscriptionStatus(userId, true);
        await databaseService.setHasPurchasedSubscriptionBefore(userId);

        // Send Discord notification
        await discordService.sendAppStoreNotification({
            type: "SUBSCRIBED",
            userId,
            productId: transaction.productId,
            transactionId: transaction.originalTransactionId,
            environment: config.apple.environment,
            price: transaction.price,
            currency: transaction.currency
        });
    }

    private async handleSubscriptionRenewed(
        userId: string,
        transaction: JWSTransactionDecodedPayload
    ): Promise<void> {
        logger.info("Subscription renewed:", {
            userId,
            transactionId: transaction.originalTransactionId,
        });

        // Insert new transaction record for the renewal
        if (transaction.originalTransactionId && transaction.productId) {
            await databaseService.insertSubscriptionRecord({
                user_id: userId,
                product_id: transaction.productId,
                transaction_id: transaction.originalTransactionId,
                environment: config.apple.environment,
                purchased_at: new Date(
                    transaction.purchaseDate || Date.now()
                ).toISOString(),
            });
        }

        await databaseService.updateUserSubscriptionStatus(userId, true);

        // Send Discord notification
        await discordService.sendAppStoreNotification({
            type: "DID_RENEW",
            userId,
            productId: transaction.productId,
            transactionId: transaction.originalTransactionId,
            environment: config.apple.environment,
            price: transaction.price,
            currency: transaction.currency
        });
    }

    private async handleSubscriptionExpired(
        userId: string,
        transaction: JWSTransactionDecodedPayload
    ): Promise<void> {
        logger.info("Subscription expired:", {
            userId,
            transactionId: transaction.originalTransactionId,
        });

        await databaseService.updateUserSubscriptionStatus(userId, false);

        // Send Discord notification
        await discordService.sendAppStoreNotification({
            type: "EXPIRED",
            userId,
            productId: transaction.productId,
            transactionId: transaction.originalTransactionId,
            environment: config.apple.environment,
            price: transaction.price,
            currency: transaction.currency
        });
    }

    private async handleRenewalStatusChange(
        userId: string,
        transaction: JWSTransactionDecodedPayload,
        notification: WebhookNotification
    ): Promise<void> {
        logger.info("Renewal status changed:", {
            userId,
            transactionId: transaction.originalTransactionId,
            subtype: notification.subtype,
        });

        // Handle auto-renewal status changes
        // This is informational and doesn't immediately affect subscription status

        // Send Discord notification
        await discordService.sendAppStoreNotification({
            type: "DID_CHANGE_RENEWAL_STATUS",
            userId,
            productId: transaction.productId,
            transactionId: transaction.originalTransactionId,
            environment: config.apple.environment,
            price: transaction.price,
            currency: transaction.currency
        });
    }

    private async handleRefund(
        userId: string,
        transaction: JWSTransactionDecodedPayload
    ): Promise<void> {
        logger.info("Subscription refunded:", {
            userId,
            transactionId: transaction.originalTransactionId,
        });

        await databaseService.updateUserSubscriptionStatus(userId, false);

        // Send Discord notification
        await discordService.sendAppStoreNotification({
            type: "REFUND",
            userId,
            productId: transaction.productId,
            transactionId: transaction.originalTransactionId,
            environment: config.apple.environment,
            price: transaction.price,
            currency: transaction.currency
        });
    }

    private isSubscriptionActive(
        transaction: JWSTransactionDecodedPayload
    ): boolean {
        // Check if the transaction is for a subscription product
        if (
            !transaction.productId ||
            !Object.values(SUBSCRIPTION_PRODUCTS).includes(
                transaction.productId as any
            )
        ) {
            return false;
        }

        // For subscriptions, check if it hasn't expired
        if (transaction.expiresDate) {
            const expiresDate = new Date(transaction.expiresDate);
            const now = new Date();
            return expiresDate > now;
        }

        // If no expiry date, it might be a non-renewable purchase
        return true;
    }

    async getSubscriptionStatus(
        userId: string
    ): Promise<{ active: boolean; expiresDate?: string }> {
        try {
            const subscriptions = await databaseService.getActiveSubscriptions(
                userId
            );

            if (subscriptions.length === 0) {
                return { active: false };
            }

            // Check the most recent subscription
            const latestSubscription = subscriptions[0];
            if (!latestSubscription) {
                return { active: false };
            }

            const transactionHistoryRequest: TransactionHistoryRequest = {
                sort: Order.ASCENDING,
                revoked: false,
                productTypes: [ProductType.AUTO_RENEWABLE],
            };

            // Get current subscription status from Apple
            const transactionHistory = await this.client.getTransactionHistory(
                latestSubscription.transaction_id,
                null, // revision
                // startDate
                transactionHistoryRequest
            );

            if (
                transactionHistory.signedTransactions &&
                transactionHistory.signedTransactions.length > 0
            ) {
                const firstTransaction =
                    transactionHistory.signedTransactions[0];
                if (!firstTransaction) {
                    return { active: false };
                }
                const latestTransaction =
                    await this.verifier.verifyAndDecodeTransaction(
                        firstTransaction
                    );

                if (latestTransaction) {
                    const isActive =
                        this.isSubscriptionActive(latestTransaction);
                    const result: { active: boolean; expiresDate?: string } = {
                        active: isActive,
                    };
                    if (latestTransaction.expiresDate) {
                        result.expiresDate = new Date(
                            latestTransaction.expiresDate
                        ).toISOString();
                    }
                    return result;
                }
            }

            return { active: false };
        } catch (error) {
            logger.error("Error checking subscription status:", error);
            return { active: false };
        }
    }
}

export const appStoreService = new AppStoreService();
