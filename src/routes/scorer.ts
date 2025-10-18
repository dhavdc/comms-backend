import { Router } from "express";
import { scorerService } from "@/services/scorer.js";
import { authenticateAPI, AuthenticatedRequest } from "@/middleware/auth.js";
import logger from "@/utils/logger.js";

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateAPI);

/**
 * POST /api/scorer/compare
 * Compare a user's message using template-based variable scoring
 */
router.post("/compare", async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
        const { processedTemplate, variables, userInput } = req.body;

        // Validate required fields
        if (!processedTemplate || !variables || !userInput) {
            res.status(400).json({
                success: false,
                error: "Missing required fields: processedTemplate, variables, userInput",
            });
            return;
        }

        logger.info("Template-based message comparison request:", {
            processedTemplate,
            variables,
            userInput,
        });

        const result = await scorerService.compareMessagesWithTemplate(
            processedTemplate,
            variables,
            userInput
        );

        res.json({
            success: true,
            data: {
                correct: result.correct,
                similarity: result.similarity,
                variableScore: result.variableScore,
                semanticScore: result.semanticScore,
                matchedVariables: result.matchedVariables,
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
