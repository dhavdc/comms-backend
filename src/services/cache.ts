import { Redis } from "ioredis";
import { createHash } from "crypto";
import logger from "@/utils/logger.js";

class CacheService {
    private redis: Redis | null = null;
    private readonly TTS_PREFIX = "tts:";

    constructor() {
        this.initializeRedis();
    }

    private initializeRedis(): void {
        const redisUrl = process.env.REDIS_URL;

        if (!redisUrl) {
            logger.warn(
                "REDIS_URL not configured - TTS caching will be disabled"
            );
            return;
        }

        try {
            this.redis = new Redis(redisUrl as string, {
                family: 0, // Enable dual stack (IPv4 and IPv6) for Railway private network
                maxRetriesPerRequest: 3,
                retryStrategy(times: number) {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                reconnectOnError(err: Error) {
                    const targetError = "READONLY";
                    if (err.message.includes(targetError)) {
                        return true;
                    }
                    return false;
                },
            });

            this.redis.on("error", (err: Error) => {
                logger.error("Redis client error:", err);
            });

            this.redis.on("connect", () => {
                logger.info("Redis client connected successfully");
            });

            this.redis.on("ready", () => {
                logger.info("Redis client ready");
            });

            logger.info("Redis client initialized");
        } catch (error) {
            logger.error("Failed to initialize Redis client:", error);
            this.redis = null;
        }
    }

    /**
     * Generate a cache key by hashing TTS parameters
     * Includes text, voiceId, modelId, and voice settings to ensure uniqueness
     */
    private generateTTSKey(
        text: string,
        voiceId: string,
        modelId: string,
        voiceSettings: { instructions?: string; emotion?: string }
    ): string {
        const payload = JSON.stringify({
            text,
            voiceId,
            modelId,
            voiceSettings,
        });

        const hash = createHash("md5").update(payload).digest("hex");
        return `${this.TTS_PREFIX}${hash}`;
    }

    /**
     * Get cached TTS audio
     * Returns Buffer if found, null if not found or Redis unavailable
     */
    async getCachedTTS(
        text: string,
        voiceId: string,
        modelId: string,
        voiceSettings: { instructions?: string; emotion?: string }
    ): Promise<Buffer | null> {
        if (!this.redis) {
            return null;
        }

        try {
            const key = this.generateTTSKey(
                text,
                voiceId,
                modelId,
                voiceSettings
            );
            const cached = await this.redis.getBuffer(key);

            if (cached) {
                logger.info("TTS cache hit", {
                    textLength: text.length,
                    voiceId,
                });
                return cached;
            }

            logger.info("TTS cache miss", {
                textLength: text.length,
                voiceId,
            });
            return null;
        } catch (error) {
            logger.error("Error retrieving from TTS cache:", error);
            return null;
        }
    }

    /**
     * Store TTS audio in cache
     * No expiration - TTS output is deterministic and never becomes stale
     * Redis will handle eviction via LRU policy when memory is needed
     * Returns true if successful, false otherwise
     */
    async setCachedTTS(
        text: string,
        voiceId: string,
        modelId: string,
        voiceSettings: { instructions?: string; emotion?: string },
        audioBuffer: Buffer
    ): Promise<boolean> {
        if (!this.redis) {
            return false;
        }

        try {
            const key = this.generateTTSKey(
                text,
                voiceId,
                modelId,
                voiceSettings
            );
            await this.redis.set(key, audioBuffer);

            logger.info("TTS audio cached", {
                textLength: text.length,
                voiceId,
                bufferSize: audioBuffer.length,
            });
            return true;
        } catch (error) {
            logger.error("Error storing in TTS cache:", error);
            return false;
        }
    }

    /**
     * Close Redis connection gracefully
     */
    async close(): Promise<void> {
        if (this.redis) {
            await this.redis.quit();
            this.redis = null;
            logger.info("Redis client disconnected");
        }
    }
}

export const cacheService = new CacheService();
