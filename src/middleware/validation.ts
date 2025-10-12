import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import logger from "@/utils/logger";
import { APIResponse } from "@/types";

export const validate = (schema: Joi.ObjectSchema) => {
    return (
        req: Request,
        res: Response<APIResponse>,
        next: NextFunction
    ): void => {
        const { error } = schema.validate(req.body);

        if (error) {
            logger.warn("Validation error:", {
                path: req.path,
                error: error.details[0]?.message,
            });

            res.status(400).json({
                success: false,
                error: error.details[0]?.message || "Validation error",
            });
            return;
        }

        next();
    };
};

export const validateReceiptSchema = Joi.object({
    purchaseToken: Joi.string().required(),
    userId: Joi.string().required(),
    transactionId: Joi.string().optional(),
    productId: Joi.string().required(),
    environment: Joi.string().valid("Sandbox", "Production").optional(),
});

export const validateWebhookSchema = Joi.object({
    signedPayload: Joi.string().required(),
});

export const validateTTSSchema = Joi.object({
    voiceId: Joi.string()
        .valid(
            "2EiwWnXFnvU5JabPnv8n", // Clyde
            "CwhRBWXzGAHq8TQ4Fs17", // Roger
            "EXAVITQu4vr4xnSDxMaL", // Sarah
            "GBv7mTt0atIp3Br8iCZE", // Thomas
            "IKne3meq5aSn9XLyUdCD", // Charlie
            "JBFqnCBsd6RMkjVDRZzb", // George
            "TX3LPaxmHKxFdv7VOQHJ", // Liam
            "cjVigY5qzO86Huf0OWal", // Eric
            "pFZP5JQG7iQjIQuC4Bku" // Lily
        )
        .required(),
    text: Joi.string().required().max(4096), // OpenAI TTS limit
    emotion: Joi.string()
        .valid("happy", "normal", "upset", "angry", "angry_pointing", "rage")
        .optional(),
});
