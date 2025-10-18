import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/utils/config.js";
import logger from "@/utils/logger.js";
import { SubscriptionRecord, UserProfile } from "@/types/index.js";

class DatabaseService {
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(
            config.supabase.url,
            config.supabase.serviceRoleKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );
    }

    async insertSubscriptionRecord(
        subscription: Omit<
            SubscriptionRecord,
            "id" | "created_at" | "updated_at"
        >
    ): Promise<SubscriptionRecord | null> {
        try {
            // Use upsert to handle duplicate transactions gracefully
            const { data, error } = await this.supabase
                .from("subscriptions")
                .upsert(subscription, {
                    onConflict: "transaction_id",
                    ignoreDuplicates: false,
                })
                .select()
                .single();

            if (error) {
                logger.error("Error inserting subscription record:", error);
                return null;
            }

            logger.info("Subscription record inserted/updated:", {
                userId: subscription.user_id,
                transactionId: subscription.transaction_id,
            });
            return data;
        } catch (error) {
            logger.error("Database error inserting subscription:", error);
            return null;
        }
    }

    async getUserProfile(userId: string): Promise<UserProfile | null> {
        try {
            console.log("Getting user profile for user:", userId);
            const { data, error } = await this.supabase
                .from("profiles")
                .select("*")
                .eq("user_id", userId)
                .single();

            if (error) {
                logger.error("Error fetching user profile:", error);
                return null;
            }

            return data;
        } catch (error) {
            logger.error("Database error fetching user profile:", error);
            return null;
        }
    }

    async updateUserSubscriptionStatus(
        userId: string,
        subscribed: boolean
    ): Promise<boolean> {
        try {
            const { error } = await this.supabase
                .from("profiles")
                .update({
                    subscribed,
                    subscribed_updated_time: new Date().toISOString(),
                })
                .eq("user_id", userId);

            if (error) {
                logger.error("Error updating user subscription status:", error);
                return false;
            }

            logger.info("User subscription status updated:", {
                userId,
                subscribed,
            });
            return true;
        } catch (error) {
            logger.error("Database error updating subscription status:", error);
            return false;
        }
    }

    async setHasPurchasedSubscriptionBefore(userId: string): Promise<boolean> {
        try {
            const { error } = await this.supabase
                .from("profiles")
                .update({ has_purchased_subscription_before: true })
                .eq("user_id", userId);

            if (error) {
                logger.error("Error setting purchase history flag:", error);
                return false;
            }

            logger.info("Purchase history flag set for user:", { userId });
            return true;
        } catch (error) {
            logger.error("Database error setting purchase history:", error);
            return false;
        }
    }

    async getActiveSubscriptions(
        userId: string
    ): Promise<SubscriptionRecord[]> {
        try {
            const { data, error } = await this.supabase
                .from("subscriptions")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false });

            if (error) {
                logger.error("Error fetching user subscriptions:", error);
                return [];
            }

            return data || [];
        } catch (error) {
            logger.error("Database error fetching subscriptions:", error);
            return [];
        }
    }

    async getSubscriptionByTransactionId(
        transactionId: string
    ): Promise<SubscriptionRecord | null> {
        try {
            const { data, error } = await this.supabase
                .from("subscriptions")
                .select("*")
                .eq("transaction_id", transactionId)
                .single();

            if (error) {
                if (error.code === "PGRST116") {
                    // No rows found
                    return null;
                }
                logger.error(
                    "Error fetching subscription by transaction ID:",
                    error
                );
                return null;
            }

            return data;
        } catch (error) {
            logger.error(
                "Database error fetching subscription by transaction ID:",
                error
            );
            return null;
        }
    }

    async getUserPremiumStatus(
        userId: string
    ): Promise<{ isPremium: boolean; reason: string }> {
        try {
            const profile = await this.getUserProfile(userId);
            if (!profile) {
                return { isPremium: false, reason: "User profile not found" };
            }

            if (profile.one_time_unlock) {
                return { isPremium: true, reason: "One-time unlock" };
            }

            if (profile.subscribed) {
                return { isPremium: true, reason: "Active subscription" };
            }

            return { isPremium: false, reason: "No active premium access" };
        } catch (error) {
            logger.error("Error checking user premium status:", error);
            return { isPremium: false, reason: "Database error" };
        }
    }

    async updateSubscriptionExpiredStatus(
        transactionId: string,
        expired: boolean
    ): Promise<boolean> {
        try {
            const { error } = await this.supabase
                .from("subscriptions")
                .update({ expired })
                .eq("transaction_id", transactionId);

            if (error) {
                logger.error("Error updating subscription expired status:", error);
                return false;
            }

            logger.info("Subscription expired status updated:", {
                transactionId,
                expired,
            });
            return true;
        } catch (error) {
            logger.error("Database error updating expired status:", error);
            return false;
        }
    }
}

export const databaseService = new DatabaseService();
