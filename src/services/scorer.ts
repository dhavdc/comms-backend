import similarity from "compute-cosine-similarity";
import logger from "@/utils/logger";

// Type imports for transformers (using type-only import)
import type { FeatureExtractionPipeline, Tensor } from "@xenova/transformers";

// Threshold for cosine similarity to determine if messages match
const SIMILARITY_THRESHOLD = 0.91;

class ScorerService {
    private extractor: FeatureExtractionPipeline | null = null;
    private initializationPromise: Promise<void> | null = null;

    constructor() {
        // Initialize the model lazily
        this.initializationPromise = this.initializeModel();
    }

    private async initializeModel(): Promise<void> {
        try {
            logger.info("Loading sentence-transformers/all-MiniLM-L6-v2 model...");

            // Dynamic import for ES Module
            const { pipeline } = await import("@xenova/transformers");

            this.extractor = (await pipeline(
                "feature-extraction",
                "Xenova/all-MiniLM-L6-v2"
            )) as FeatureExtractionPipeline;
            logger.info("Model loaded successfully");
        } catch (error) {
            logger.error("Error loading embedding model:", error);
            throw error;
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (this.initializationPromise) {
            await this.initializationPromise;
        }
    }

    private async getEmbedding(text: string): Promise<number[]> {
        await this.ensureInitialized();

        if (!this.extractor) {
            throw new Error("Model not initialized");
        }

        const output: Tensor = await this.extractor(text, {
            pooling: "mean",
            normalize: true,
        });

        // Convert the output tensor to a regular array
        return Array.from(output.data as Float32Array);
    }

    async compareMessages(
        correctMessage: string,
        userInput: string
    ): Promise<{ correct: boolean; similarity?: number }> {
        try {
            logger.info("Comparing messages:", {
                correctMessage,
                userInput,
            });

            // Get embeddings for both messages
            const correctEmbedding = await this.getEmbedding(correctMessage);
            const userEmbedding = await this.getEmbedding(userInput);

            // Calculate cosine similarity
            const similarityScore = similarity(
                correctEmbedding,
                userEmbedding
            );

            logger.info("Similarity score:", {
                similarity: similarityScore,
                threshold: SIMILARITY_THRESHOLD,
            });

            // Determine if the similarity meets the threshold
            const correct = similarityScore !== null && similarityScore >= SIMILARITY_THRESHOLD;

            return similarityScore !== null
                ? { correct, similarity: similarityScore }
                : { correct };
        } catch (error) {
            logger.error("Error comparing messages:", error);
            throw error;
        }
    }
}

export const scorerService = new ScorerService();
export { SIMILARITY_THRESHOLD };
