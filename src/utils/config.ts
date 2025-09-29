import dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

dotenv.config();

interface Config {
    port: number;
    nodeEnv: string;
    supabase: {
        url: string;
        serviceRoleKey: string;
    };
    apple: {
        issuerId: string;
        keyId: string;
        bundleId: string;
        environment: "Sandbox" | "Production";
        privateKey: string;
    };
    security: {
        jwtSecret: string;
        apiKey: string;
    };
    logging: {
        level: string;
    };
}

function loadApplePrivateKey(): string {
    const key = process.env.APPLE_PRIVATE_KEY;
    if (!key) {
        throw new Error("APPLE_PRIVATE_KEY environment variable is required");
    }

    try {
        return key;
    } catch (error) {
        throw new Error(
            `Failed to load Apple private key from ${key}: ${error}`
        );
    }
}

function validateConfig(): Config {
    const requiredEnvVars = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "APPLE_ISSUER_ID",
        "APPLE_KEY_ID",
        "APPLE_BUNDLE_ID",
        "APPLE_PRIVATE_KEY",
        "JWT_SECRET",
        "API_KEY",
    ];

    const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);
    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`
        );
    }

    const environment = process.env.APPLE_ENVIRONMENT;
    if (environment && !["Sandbox", "Production"].includes(environment)) {
        throw new Error(
            'APPLE_ENVIRONMENT must be either "Sandbox" or "Production"'
        );
    }

    return {
        port: parseInt(process.env.PORT || "3001", 10),
        nodeEnv: process.env.NODE_ENV || "development",
        supabase: {
            url: process.env.SUPABASE_URL!,
            serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        apple: {
            issuerId: process.env.APPLE_ISSUER_ID!,
            keyId: process.env.APPLE_KEY_ID!,
            bundleId: process.env.APPLE_BUNDLE_ID!,
            environment: (environment as "Sandbox" | "Production") || "Sandbox",
            privateKey: loadApplePrivateKey(),
        },
        security: {
            jwtSecret: process.env.JWT_SECRET!,
            apiKey: process.env.API_KEY!,
        },
        logging: {
            level: process.env.LOG_LEVEL || "info",
        },
    };
}

export const config = validateConfig();
