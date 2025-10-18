import { Router } from "express";
import { authenticateAPI, AuthenticatedRequest } from "@/middleware/auth.js";
import { validate, validateTTSSchema } from "@/middleware/validation.js";
import { cacheService } from "@/services/cache.js";
import logger from "@/utils/logger.js";

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
    IKne3meq5aSn9XLyUdCD: "ash", // Charlie - Male, multilingual (engaging storyteller)
    JBFqnCBsd6RMkjVDRZzb: "fable", // George - Male, English (neutral and balanced)
    TX3LPaxmHKxFdv7VOQHJ: "verse", // Liam - Male, young, articulate (versatile and expressive)
    cjVigY5qzO86Huf0OWal: "ballad", // Eric - Male, friendly, conversational (melodic and smooth)
    pFZP5JQG7iQjIQuC4Bku: "alloy", // Lily - Female, British, warm, narration (warm and friendly)
};

/**
 * Map ElevenLabs voice ID to OpenAI voice name
 * Falls back to 'alloy' if voice ID not found
 */
function mapVoiceIdToOpenAI(voiceId: string): string {
    return VOICE_MAPPING[voiceId] || "alloy";
}

/**
 * Generate emotion-specific instruction modifiers for TTS
 */
function getEmotionInstructions(emotion?: string): string {
    const emotionModifiers: Record<string, string> = {
        happy: "Use an encouraging, friendly, and supportive tone. Sound pleased and positive.",
        normal: "Maintain a neutral, professional tone. Be clear and straightforward.",
        upset: "Use a slightly stern, corrective tone. Sound mildly irritated but still professional.",
        angry: "Use a firm, impatient tone. Sound noticeably frustrated but maintain control.",
        angry_pointing:
            "Use a sharp, direct tone. Sound very frustrated and emphatic.",
        rage: "Use an extremely stern, sharp tone. Sound highly irritated and impatient, but still intelligible.",
    };

    return emotion && emotionModifiers[emotion]
        ? ` ${emotionModifiers[emotion]}`
        : "";
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
            const { voiceId, text, emotion } = req.body;

            // Map ElevenLabs voice ID to OpenAI voice
            const openaiVoice = mapVoiceIdToOpenAI(voiceId);

            const model = "gpt-4o-mini-tts";
            const response_format = "mp3";

            // Base instructions with emotion modifier
            const baseInstructions =
                "Speak in a clear, professional air traffic control style. Use a calm, authoritative tone with precise pronunciation. Maintain a steady pace typical of aviation radio communications. Use the phonetic alphabet for capitilized letters (individual or together) (e.g. Alpha for A, Bravo for B, etc.) N123AZ should be pronounced as November one, two, three, alpha, zulu. Numbers should be pronounced separately from each other. For example, 123 should be pronounced as one, two, three.";
            const emotionModifier = getEmotionInstructions(emotion);
            const instructions = baseInstructions + emotionModifier;

            logger.info("TTS synthesis request received:", {
                elevenLabsVoiceId: voiceId,
                openaiVoice,
                textLength: text.length,
                emotion: emotion || "none",
            });

            // Check cache first (include emotion in cache key)
            const cachedAudio = await cacheService.getCachedTTS(
                text,
                voiceId,
                model,
                { instructions, emotion }
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
                speed: 1.25,
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

            // Cache the audio (include emotion in cache key)
            cacheService.setCachedTTS(
                text,
                voiceId,
                model,
                { instructions, emotion },
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
