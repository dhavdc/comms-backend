import { Request, Response, NextFunction } from "express";
import { config } from "@/utils/config.js";
import logger from "@/utils/logger.js";
import { APIResponse } from "@/types/index.js";

interface AuthenticatedRequest extends Request {
    userId?: string;
}

export const authenticateAPI = (
    req: AuthenticatedRequest,
    res: Response<APIResponse>,
    next: NextFunction
): void => {
    const apiKey = req.headers["x-api-key"] as string;

    console.log(apiKey);

    if (!apiKey || apiKey !== config.security.apiKey) {
        logger.warn("Unauthorized API access attempt", {
            ip: req.ip,
            userAgent: req.get("User-Agent"),
            path: req.path,
        });

        res.status(401).json({
            success: false,
            error: "Unauthorized",
        });
        return;
    }

    next();
};

export const extractUserId = (
    req: AuthenticatedRequest,
    res: Response<APIResponse>,
    next: NextFunction
): void => {
    const userId = (req.headers["x-user-id"] as string) || req.body.userId;

    if (!userId) {
        logger.warn("Missing user ID in request", {
            path: req.path,
            method: req.method,
        });

        res.status(400).json({
            success: false,
            error: "User ID is required",
        });
        return;
    }

    req.userId = userId;
    next();
};

export { AuthenticatedRequest };
