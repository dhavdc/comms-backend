import {
    pipeline,
    FeatureExtractionPipeline,
    Tensor,
} from "@xenova/transformers";
import similarity from "compute-cosine-similarity";
import logger from "@/utils/logger.js";

// Threshold for cosine similarity to determine if messages match
const SIMILARITY_THRESHOLD = 0.91;

// Weights for combined scoring
const VARIABLE_WEIGHT = 0.6; // How much variable matching matters
const SEMANTIC_WEIGHT = 0.4; // How much semantic similarity matters

// Variable match threshold (fuzzy matching for individual variables)
const VARIABLE_MATCH_THRESHOLD = 0.8;

class ScorerService {
    private extractor: FeatureExtractionPipeline | null = null;
    private initializationPromise: Promise<void> | null = null;

    constructor() {
        // Initialize the model lazily
        this.initializationPromise = this.initializeModel();
    }

    private async initializeModel(): Promise<void> {
        try {
            logger.info(
                "Loading sentence-transformers/all-MiniLM-L6-v2 model..."
            );

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
            const similarityScore = similarity(correctEmbedding, userEmbedding);

            logger.info("Similarity score:", {
                similarity: similarityScore,
                threshold: SIMILARITY_THRESHOLD,
            });

            // Determine if the similarity meets the threshold
            const correct =
                similarityScore !== null &&
                similarityScore >= SIMILARITY_THRESHOLD;

            return similarityScore !== null
                ? { correct, similarity: similarityScore }
                : { correct };
        } catch (error) {
            logger.error("Error comparing messages:", error);
            throw error;
        }
    }

    /**
     * Compare messages using processed template and variable checking
     * This allows for flexible variable ordering and optional variables
     */
    async compareMessagesWithTemplate(
        processedTemplate: string,
        variables: Record<string, { value: string; required: boolean }>,
        userInput: string
    ): Promise<{
        correct: boolean;
        similarity: number;
        variableScore: number;
        semanticScore: number;
        matchedVariables: Record<string, boolean>;
    }> {
        try {
            logger.info("Template-based comparison:", {
                processedTemplate,
                variables,
                userInput,
            });

            const normalizedInput = userInput.toLowerCase().trim();

            // 1. Check if variables appear in user input (order-independent, fuzzy matching)
            const variableResults = this.scoreVariables(
                variables,
                normalizedInput
            );

            // 2. Get semantic similarity between processed template and user input
            const templateEmbedding = await this.getEmbedding(
                processedTemplate.toLowerCase()
            );
            const userEmbedding = await this.getEmbedding(normalizedInput);
            const rawSemantic = similarity(templateEmbedding, userEmbedding);
            const semanticScore = rawSemantic !== null ? rawSemantic : 0;

            // 3. Combine scores (variables matter more for ATC communications)
            const variableScore = variableResults.score;
            const combinedScore =
                variableScore * VARIABLE_WEIGHT +
                semanticScore * SEMANTIC_WEIGHT;

            logger.info("Scoring results:", {
                variableScore,
                semanticScore,
                combinedScore,
                threshold: SIMILARITY_THRESHOLD,
                matchedVariables: variableResults.matchedVariables,
            });

            const correct = combinedScore >= SIMILARITY_THRESHOLD;

            return {
                correct,
                similarity: combinedScore,
                variableScore,
                semanticScore,
                matchedVariables: variableResults.matchedVariables,
            };
        } catch (error) {
            logger.error("Error in template-based comparison:", error);
            throw error;
        }
    }

    /**
     * Score how well variables match in the user input
     */
    private scoreVariables(
        variables: Record<string, { value: string; required: boolean }>,
        userInput: string
    ): {
        score: number;
        matchedVariables: Record<string, boolean>;
    } {
        const matchedVariables: Record<string, boolean> = {};
        let totalWeight = 0;
        let matchedWeight = 0;

        // Group alternates (callsign_short and callsign_phonetic)
        const callsignAlternates = ["callsign_short", "callsign_phonetic"];
        const hasCallsignAlternates = callsignAlternates.some(
            (alt) => alt in variables
        );

        // Process callsign alternates as a group (if EITHER matches, full credit)
        if (hasCallsignAlternates) {
            totalWeight += 1.0; // Callsign counts as 1.0 weight
            let anyCallsignMatched = false;

            for (const altName of callsignAlternates) {
                if (altName in variables) {
                    const varData = variables[altName];
                    if (!varData) {
                        continue;
                    }
                    const normalizedValue = varData.value.toLowerCase().trim();
                    const normalizedInput = userInput.toLowerCase();

                    const valueWords = normalizedValue.split(/\s+/);
                    const inputWords = normalizedInput.split(/\s+/);

                    let matchedWords = 0;
                    for (const word of valueWords) {
                        if (
                            inputWords.some((iw) =>
                                this.fuzzyWordMatch(word, iw)
                            )
                        ) {
                            matchedWords++;
                        }
                    }

                    const wordMatchRatio = matchedWords / valueWords.length;

                    if (wordMatchRatio >= VARIABLE_MATCH_THRESHOLD) {
                        matchedVariables[altName] = true;
                        anyCallsignMatched = true;
                    } else {
                        matchedVariables[altName] = false;
                    }
                }
            }

            if (anyCallsignMatched) {
                matchedWeight += 1.0; // Full credit if ANY callsign version matches
            }
        }

        // Process all other variables normally
        for (const [varName, varData] of Object.entries(variables)) {
            // Skip callsign alternates (already handled above)
            if (callsignAlternates.includes(varName)) continue;

            const weight = varData.required ? 1.0 : 0.5; // Required vars matter more
            totalWeight += weight;

            const normalizedValue = varData.value.toLowerCase().trim();
            const normalizedInput = userInput.toLowerCase();

            // Check if variable value appears in user input (fuzzy matching)
            const valueWords = normalizedValue.split(/\s+/);
            const inputWords = normalizedInput.split(/\s+/);

            // Simple fuzzy matching: check if most words from the variable appear
            let matchedWords = 0;
            for (const word of valueWords) {
                if (inputWords.some((iw) => this.fuzzyWordMatch(word, iw))) {
                    matchedWords++;
                }
            }

            const wordMatchRatio = matchedWords / valueWords.length;

            // Variable matches if most of its words are found
            if (wordMatchRatio >= VARIABLE_MATCH_THRESHOLD) {
                matchedVariables[varName] = true;
                matchedWeight += weight;
            } else if (!varData.required && wordMatchRatio > 0.3) {
                // Optional variables get partial credit
                matchedVariables[varName] = true;
                matchedWeight += weight * wordMatchRatio;
            } else {
                matchedVariables[varName] = false;
            }
        }

        const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
        return { score, matchedVariables };
    }

    /**
     * Simple fuzzy word matching for speech recognition
     * (Speech doesn't make typos, so we just check exact match or containment)
     */
    private fuzzyWordMatch(word1: string, word2: string): boolean {
        if (word1 === word2) return true;

        // Check if one word contains the other (for partial matches)
        if (word1.includes(word2) || word2.includes(word1)) return true;

        return false;
    }
}

export const scorerService = new ScorerService();
export { SIMILARITY_THRESHOLD };
