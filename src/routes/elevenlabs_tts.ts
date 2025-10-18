import { Router } from "express";
import { authenticateAPI, AuthenticatedRequest } from "@/middleware/auth.js";
import { validate, validateTTSSchema } from "@/middleware/validation.js";
import { cacheService } from "@/services/cache.js";
import logger from "@/utils/logger.js";

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

            const modelId = "eleven_turbo_v2_5";
            const voiceSettings = {
                stability: 0.5,
                similarity_boost: 0.75,
            };

            logger.info("TTS synthesis request received:", {
                voiceId,
                textLength: text.length,
            });

            // Check cache first
            const cachedAudio = await cacheService.getCachedTTS(
                text,
                voiceId,
                modelId,
                voiceSettings
            );

            if (cachedAudio) {
                res.setHeader("Content-Type", "audio/mpeg");
                res.setHeader("X-Cache", "HIT");
                res.send(cachedAudio);
                return;
            }

            // Cache miss - call ElevenLabs API
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
                        model_id: modelId,
                        voice_settings: voiceSettings,
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

            // Get the audio response
            const audioBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(audioBuffer);

            // Store in cache (fire and forget - don't wait)
            cacheService.setCachedTTS(
                text,
                voiceId,
                modelId,
                voiceSettings,
                buffer
            );

            res.setHeader("Content-Type", "audio/mpeg");
            res.setHeader("X-Cache", "MISS");
            res.send(buffer);

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
