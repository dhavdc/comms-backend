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
