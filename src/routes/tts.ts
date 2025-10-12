import { Router } from "express";
import { authenticateAPI, AuthenticatedRequest } from "@/middleware/auth";
import { validate, validateTTSSchema } from "@/middleware/validation";
import { cacheService } from "@/services/cache";
import logger from "@/utils/logger";

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateAPI);

const OPENAI_API_URL = "https://api.openai.com/v1/audio/speech";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Map ElevenLabs voice IDs to OpenAI voices
// This allows the mobile app to continue using ElevenLabs voice IDs without app review
const VOICE_MAPPING: Record<string, string> = {
    "2EiwWnXFnvU5JabPnv8n": "echo", // Clyde - Male, intense, war veteran (resonant and deep)
    CwhRBWXzGAHq8TQ4Fs17: "onyx", // Roger - Male, confident (deep and authoritative)
    EXAVITQu4vr4xnSDxMaL: "nova", // Sarah - Female, southern accent (bright and energetic)
    GBv7mTt0atIp3Br8iCZE: "ash", // Thomas - Male, neutral (clear and precise)
    IKne3meq5aSn9XLyUdCD: "fable", // Charlie - Male, multilingual (engaging storyteller)
    JBFqnCBsd6RMkjVDRZzb: "alloy", // George - Male, English (neutral and balanced)
    TX3LPaxmHKxFdv7VOQHJ: "verse", // Liam - Male, young, articulate (versatile and expressive)
    cjVigY5qzO86Huf0OWal: "ballad", // Eric - Male, friendly, conversational (melodic and smooth)
    pFZP5JQG7iQjIQuC4Bku: "coral", // Lily - Female, British, warm, narration (warm and friendly)
};

/**
 * Map ElevenLabs voice ID to OpenAI voice name
 * Falls back to 'alloy' if voice ID not found
 */
function mapVoiceIdToOpenAI(voiceId: string): string {
    return VOICE_MAPPING[voiceId] || "alloy";
}

/**
 * POST /api/tts/synthesize
 * Convert text to speech using OpenAI TTS API
 */
router.post(
    "/synthesize",
    validate(validateTTSSchema),
    async (req: AuthenticatedRequest, res): Promise<void> => {
        try {
            const { voiceId, text } = req.body;

            // Map ElevenLabs voice ID to OpenAI voice
            const openaiVoice = mapVoiceIdToOpenAI(voiceId);

            const model = "gpt-4o-mini-tts";
            const response_format = "mp3";
            const instructions =
                "Speak in a clear, professional air traffic control style. Use a calm, authoritative tone with precise pronunciation. Maintain a steady pace typical of aviation radio communications. Use the phonetic alphabet for individual capitilized letters (e.g. Alpha for A, Bravo for B, etc.)";

            logger.info("TTS synthesis request received:", {
                elevenLabsVoiceId: voiceId,
                openaiVoice,
                textLength: text.length,
            });

            // Check cache first (use voiceId for cache key to maintain compatibility)
            const cachedAudio = await cacheService.getCachedTTS(
                text,
                voiceId,
                model,
                { instructions }
            );

            if (cachedAudio) {
                res.setHeader("Content-Type", "audio/mpeg");
                res.setHeader("X-Cache", "HIT");
                res.send(cachedAudio);
                return;
            }

            // Cache miss - call OpenAI TTS API
            const requestBody = {
                model,
                input: text,
                voice: openaiVoice,
                response_format,
                instructions,
            };

            const response = await fetch(OPENAI_API_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error("OpenAI TTS API error:", {
                    status: response.status,
                    error: errorText,
                });

                res.status(response.status).json({
                    success: false,
                    error: `OpenAI TTS API error: ${response.statusText}`,
                });
                return;
            }

            // Get the full audio buffer
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Cache the audio
            cacheService.setCachedTTS(
                text,
                voiceId,
                model,
                { instructions },
                buffer
            );

            // Send to client
            res.setHeader("Content-Type", "audio/mpeg");
            res.setHeader("X-Cache", "MISS");
            res.send(buffer);

            logger.info("TTS synthesis completed successfully");
        } catch (error) {
            logger.error("TTS synthesis error:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: "Internal server error",
                });
            }
        }
    }
);

export default router;
