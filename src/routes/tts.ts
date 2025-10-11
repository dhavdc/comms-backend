import { Router } from "express";
import { authenticateAPI, AuthenticatedRequest } from "@/middleware/auth";
import { validate, validateTTSSchema } from "@/middleware/validation";
import logger from "@/utils/logger";

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateAPI);

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

/**
 * POST /api/tts/synthesize
 * Convert text to speech using ElevenLabs API
 */
router.post(
    "/synthesize",
    validate(validateTTSSchema),
    async (req: AuthenticatedRequest, res): Promise<void> => {
        try {
            const { voiceId, text } = req.body;

            logger.info("TTS synthesis request received:", {
                voiceId,
                textLength: text.length,
            });

            const response = await fetch(
                `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
                {
                    method: "POST",
                    headers: {
                        Accept: "audio/mpeg",
                        "Content-Type": "application/json",
                        "xi-api-key":
                            "5a934b3095ba12e94e0f834716527afd492495859d86fd738b4b1d769961be32",
                    },
                    body: JSON.stringify({
                        text,
                        model_id: "eleven_turbo_v2_5",
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75,
                        },
                    }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                logger.error("ElevenLabs API error:", {
                    status: response.status,
                    error: errorText,
                });

                res.status(response.status).json({
                    success: false,
                    error: `ElevenLabs API error: ${response.statusText}`,
                });
                return;
            }

            // Stream the audio response
            const audioBuffer = await response.arrayBuffer();

            res.setHeader("Content-Type", "audio/mpeg");
            res.send(Buffer.from(audioBuffer));

            logger.info("TTS synthesis completed successfully");
        } catch (error) {
            logger.error("TTS synthesis error:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error",
            });
        }
    }
);

export default router;
