export interface SubscriptionRecord {
    id?: number;
    user_id: string;
    product_id: string;
    transaction_id: string;
    environment: "Sandbox" | "Production";
    purchased_at: string;
    created_at?: string;
    updated_at?: string;
}

export interface UserProfile {
    user_id: string;
    callsign: string;
    callsign_spoken?: string;
    experience_level: string;
    free_situations_completed: number;
    has_purchased_subscription_before: boolean;
    onboarding_complete: boolean;
    one_time_unlock: boolean;
    subscribed: boolean;
    subscribed_updated_time?: string;
    created_at: string;
}

export interface ValidationRequest {
    purchaseToken: string;
    userId: string;
    transactionId?: string;
    productId: string;
    environment?: "Sandbox" | "Production";
}

export interface ValidationResponse {
    success: boolean;
    subscriptionActive: boolean;
    transactionId?: string | undefined;
    expiresDate?: string | undefined;
    error?: string | undefined;
}

export interface WebhookNotification {
    notificationType: string;
    subtype?: string;
    data: {
        appAppleId: number;
        bundleId: string;
        bundleVersion: string;
        environment: string;
        signedTransactionInfo: string;
        signedRenewalInfo?: string;
    };
    version: string;
    signedDate: number;
}

export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export const SUBSCRIPTION_PRODUCTS = {
    WEEKLY: "com.comms.comms.premium_weekly",
    MONTHLY: "com.comms.comms.premium_monthly",
    YEARLY: "com.comms.comms.premium_yearly",
} as const;

export type SubscriptionProduct =
    (typeof SUBSCRIPTION_PRODUCTS)[keyof typeof SUBSCRIPTION_PRODUCTS];

export interface SupabaseWebhookPayload {
    type: "INSERT" | "UPDATE" | "DELETE";
    table: string;
    record: any;
    schema: string;
    old_record: any | null;
}
