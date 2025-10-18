import { Router } from "express";
import { scorerService } from "@/services/scorer";
import { authenticateAPI, AuthenticatedRequest } from "@/middleware/auth";
import logger from "@/utils/logger";

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateAPI);

/**
 * POST /api/scorer/compare
 * Compare a user's message with the correct message using semantic similarity
 */
router.post("/compare", async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
        const { correctMessage, userInput } = req.body;

        // Validate required fields
        if (!correctMessage || !userInput) {
            res.status(400).json({
                success: false,
                error: "Missing required fields: correctMessage, userInput",
            });
            return;
        }

        logger.info("Message comparison request:", {
            correctMessage,
            userInput,
        });

        const result = await scorerService.compareMessages(
            correctMessage,
            userInput
        );

        res.json({
            success: true,
            data: {
                correct: result.correct,
                similarity: result.similarity,
            },
        });
    } catch (error) {
        logger.error("Message comparison error:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
});

export default router;
