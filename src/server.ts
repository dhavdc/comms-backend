import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "@/utils/config";
import logger from "@/utils/logger";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";
import { requestLogger, simpleRateLimit } from "@/middleware/security";

// Import routes
import subscriptionRoutes from "@/routes/subscriptions";
import webhookRoutes from "@/routes/webhooks";

class Server {
    private app: express.Application;

    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    private setupMiddleware(): void {
        // Trust proxy for proper IP detection (if behind reverse proxy)
        this.app.set("trust proxy", 1);

        // Security middleware
        this.app.use(
            helmet({
                contentSecurityPolicy: false, // Disable CSP for API
                crossOriginEmbedderPolicy: false,
            })
        );

        // CORS configuration
        this.app.use(
            cors({
                origin:
                    process.env.NODE_ENV === "production"
                        ? ["https://your-app-domain.com"] // Replace with your actual domain
                        : true, // Allow all origins in development
                credentials: true,
                methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                allowedHeaders: [
                    "Content-Type",
                    "Authorization",
                    "x-api-key",
                    "x-user-id",
                ],
            })
        );

        // Request parsing
        this.app.use(express.json({ limit: "10mb" }));
        this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

        // Request logging
        this.app.use(requestLogger);

        // Rate limiting (100 requests per 15 minutes per IP)
        this.app.use(simpleRateLimit(100, 15 * 60 * 1000));
    }

    private setupRoutes(): void {
        // Health check endpoint
        this.app.get("/health", (req, res) => {
            res.json({
                success: true,
                message: "Comms App Backend is running",
                timestamp: new Date().toISOString(),
                environment: config.nodeEnv,
                version: "1.0.0",
            });
        });

        // API routes
        this.app.use("/api/subscriptions", subscriptionRoutes);
        this.app.use("/api/webhooks", webhookRoutes);

        // Root endpoint
        this.app.get("/", (req, res) => {
            res.json({
                success: true,
                message: "Comms App Backend API",
                version: "1.0.0",
                endpoints: [
                    "GET /health - Health check",
                    "GET /api/subscriptions/status/:userId - Get subscription status",
                    "POST /api/subscriptions/validate - Validate App Store receipt",
                    "GET /api/subscriptions/history/:userId - Get subscription history",
                    "POST /api/subscriptions/sync/:userId - Sync subscription status",
                    "GET /api/subscriptions/premium/:userId - Check premium access",
                    "POST /api/webhooks/apple - Apple Server-to-Server notifications",
                    "GET /api/webhooks/test - Test webhook service",
                    "POST /api/webhooks/supabase/profile - Supabase profile insert notifications",
                ],
            });
        });
    }

    private setupErrorHandling(): void {
        // 404 handler (must be before error handler)
        this.app.use(notFoundHandler);

        // Global error handler (must be last)
        this.app.use(errorHandler);
    }

    public start(): void {
        const port = config.port;

        this.app.listen(port, "0.0.0.0", () => {
            logger.info(`🚀 Comms App Backend started`, {
                port,
                environment: config.nodeEnv,
                appleEnvironment: config.apple.environment,
            });

            // Log important setup information
            logger.info("Configuration loaded:", {
                supabaseUrl: config.supabase.url,
                appleBundleId: config.apple.bundleId,
                appleEnvironment: config.apple.environment,
            });
        });

        // Graceful shutdown
        process.on("SIGTERM", this.shutdown.bind(this));
        process.on("SIGINT", this.shutdown.bind(this));
    }

    private shutdown(): void {
        logger.info("Received shutdown signal, closing server...");
        process.exit(0);
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    try {
        const server = new Server();
        server.start();
    } catch (error) {
        logger.error("Failed to start server:", error);
        process.exit(1);
    }
}

export default Server;
