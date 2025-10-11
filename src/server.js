"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var cors_1 = require("cors");
var helmet_1 = require("helmet");
var config_1 = require("@/utils/config");
var logger_1 = require("@/utils/logger");
var errorHandler_1 = require("@/middleware/errorHandler");
var security_1 = require("@/middleware/security");
// Import routes
var subscriptions_1 = require("@/routes/subscriptions");
var webhooks_1 = require("@/routes/webhooks");
var tts_1 = require("@/routes/tts");
var Server = /** @class */ (function () {
    function Server() {
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    Server.prototype.setupMiddleware = function () {
        // Trust proxy for proper IP detection (if behind reverse proxy)
        this.app.set("trust proxy", 1);
        // Security middleware
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: false, // Disable CSP for API
            crossOriginEmbedderPolicy: false,
        }));
        // CORS configuration
        this.app.use((0, cors_1.default)({
            origin: process.env.NODE_ENV === "production"
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
        }));
        // Request parsing
        this.app.use(express_1.default.json({ limit: "10mb" }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
        // Request logging
        this.app.use(security_1.requestLogger);
        // Rate limiting (100 requests per 15 minutes per IP)
        this.app.use((0, security_1.simpleRateLimit)(100, 15 * 60 * 1000));
    };
    Server.prototype.setupRoutes = function () {
        // Health check endpoint
        this.app.get("/health", function (req, res) {
            res.json({
                success: true,
                message: "Comms App Backend is running",
                timestamp: new Date().toISOString(),
                environment: config_1.config.nodeEnv,
                version: "1.0.0",
            });
        });
        // API routes
        this.app.use("/api/subscriptions", subscriptions_1.default);
        this.app.use("/api/webhooks", webhooks_1.default);
        this.app.use("/api/tts", tts_1.default);
        // Root endpoint
        this.app.get("/", function (req, res) {
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
                    "POST /api/tts/synthesize - Convert text to speech using ElevenLabs",
                ],
            });
        });
    };
    Server.prototype.setupErrorHandling = function () {
        // 404 handler (must be before error handler)
        this.app.use(errorHandler_1.notFoundHandler);
        // Global error handler (must be last)
        this.app.use(errorHandler_1.errorHandler);
    };
    Server.prototype.start = function () {
        var port = config_1.config.port;
        this.app.listen(port, "0.0.0.0", function () {
            logger_1.default.info("\uD83D\uDE80 Comms App Backend started", {
                port: port,
                environment: config_1.config.nodeEnv,
                appleEnvironment: config_1.config.apple.environment,
            });
            // Log important setup information
            logger_1.default.info("Configuration loaded:", {
                supabaseUrl: config_1.config.supabase.url,
                appleBundleId: config_1.config.apple.bundleId,
                appleEnvironment: config_1.config.apple.environment,
            });
        });
        // Graceful shutdown
        process.on("SIGTERM", this.shutdown.bind(this));
        process.on("SIGINT", this.shutdown.bind(this));
    };
    Server.prototype.shutdown = function () {
        logger_1.default.info("Received shutdown signal, closing server...");
        process.exit(0);
    };
    return Server;
}());
// Start the server if this file is run directly
if (require.main === module) {
    try {
        var server = new Server();
        server.start();
    }
    catch (error) {
        logger_1.default.error("Failed to start server:", error);
        process.exit(1);
    }
}
exports.default = Server;
