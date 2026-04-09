// server/workers/analysisWorker.js
const { workerData, parentPort } = require('worker_threads');
const mongoose = require('mongoose');
const path = require('path');

const KnowledgeSource = require('../models/KnowledgeSource');
const connectDB = require('../config/db');
const geminiService = require('../services/geminiService');
const ollamaService = require('../services/ollamaService');
const { ANALYSIS_PROMPTS } = require('../config/promptTemplates');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const MAX_OLLAMA_ANALYSIS_CHARS = Number(process.env.OLLAMA_ANALYSIS_MAX_CHARS || 16000);

async function performFullAnalysis(sourceId, textForAnalysis, llmProvider, ollamaModel, apiKey, ollamaUrl) {
    const logPrefix = `[AnalysisWorker ${process.pid}, SourceID: ${sourceId}]`;
    console.log(`${logPrefix} Starting analysis. Using provider: ${llmProvider}`);

    const analysisResults = { faq: "", topics: "", mindmap: "" };
    let allIndividualAnalysesSuccessful = true; // We still track this for logging/reasoning

    let effectiveProvider = llmProvider;
    let effectiveApiKey = apiKey;

    // Prefer key explicitly passed from route, but always allow worker-level .env fallback.
    if (effectiveProvider === 'gemini' && !effectiveApiKey && process.env.GEMINI_API_KEY) {
        effectiveApiKey = process.env.GEMINI_API_KEY;
    }

    // If Gemini key is missing, fallback to Ollama instead of hard-failing the worker.
    if (effectiveProvider === 'gemini' && !effectiveApiKey) {
        console.warn(`${logPrefix} Gemini selected but no API key provided. Falling back to Ollama.`);
        effectiveProvider = 'ollama';
        effectiveApiKey = null;
    }

    {
        const analysisInput =
            effectiveProvider === 'ollama' && textForAnalysis.length > MAX_OLLAMA_ANALYSIS_CHARS
                ? textForAnalysis.slice(0, MAX_OLLAMA_ANALYSIS_CHARS)
                : textForAnalysis;

        async function generateSingleAnalysis(type, promptContentForLLM) {
            try {
                console.log(`${logPrefix} Generating ${type}...`);
                const historyForLLM = [{ role: 'user', parts: [{ text: "Perform the requested analysis based on the system instruction provided." }] }];

                const baseOptions = {
                    ollamaUrl,
                    model: ollamaModel,
                    maxOutputTokens: ollamaService.DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_KG
                };

                const runWithProvider = async (providerToUse, providerApiKey = null) => {
                    const llmOptions = {
                        ...baseOptions,
                        apiKey: providerApiKey
                    };
                    return providerToUse === 'ollama'
                        ? ollamaService.generateContentWithHistory(historyForLLM, promptContentForLLM, null, llmOptions)
                        : geminiService.generateContentWithHistory(historyForLLM, promptContentForLLM, null, llmOptions);
                };

                let generatedText;
                try {
                    generatedText = await runWithProvider(effectiveProvider, effectiveApiKey);
                } catch (primaryError) {
                    const canFallbackToGemini =
                        effectiveProvider === 'ollama' &&
                        !!process.env.GEMINI_API_KEY &&
                        /(timed out|timeout|econnaborted|econnrefused|failed to get response)/i.test(primaryError.message || '');

                    const canFallbackToOllama =
                        effectiveProvider === 'gemini' &&
                        /(api key|permission|quota|rate|401|403)/i.test(primaryError.message || '');

                    if (canFallbackToOllama) {
                        console.warn(`${logPrefix} ${type} failed on Gemini (${primaryError.message}). Retrying with Ollama fallback.`);
                        generatedText = await runWithProvider('ollama', null);
                    } else {
                        if (!canFallbackToGemini) {
                            throw primaryError;
                        }

                        console.warn(`${logPrefix} ${type} failed on Ollama (${primaryError.message}). Retrying with Gemini fallback.`);
                        generatedText = await runWithProvider('gemini', process.env.GEMINI_API_KEY);
                    }
                }

                if (!generatedText || typeof generatedText !== 'string' || generatedText.trim() === "") {
                    console.warn(`${logPrefix} LLM returned empty content for ${type}.`);
                    allIndividualAnalysesSuccessful = false; // Mark that one part failed
                    return { success: false, content: `Notice: No content generated for ${type}.` };
                }
                console.log(`${logPrefix} ${type} generation successful.`);
                return { success: true, content: generatedText.trim() };
            } catch (error) {
                console.error(`${logPrefix} Error during ${type} generation: ${error.message}`);
                allIndividualAnalysesSuccessful = false; // Mark that one part failed
                return { success: false, content: `Error generating ${type}: ${error.message.substring(0, 250)}` };
            }
        }

        let outcomes;
        if (effectiveProvider === 'ollama') {
            // Running all 3 large prompts in parallel frequently overloads local Ollama and causes timeouts.
            outcomes = [
                await generateSingleAnalysis('FAQ', ANALYSIS_PROMPTS.faq.getPrompt(analysisInput)),
                await generateSingleAnalysis('Topics', ANALYSIS_PROMPTS.topics.getPrompt(analysisInput)),
                await generateSingleAnalysis('Mindmap', ANALYSIS_PROMPTS.mindmap.getPrompt(analysisInput))
            ];
        } else {
            const analysisPromises = [
                generateSingleAnalysis('FAQ', ANALYSIS_PROMPTS.faq.getPrompt(analysisInput)),
                generateSingleAnalysis('Topics', ANALYSIS_PROMPTS.topics.getPrompt(analysisInput)),
                generateSingleAnalysis('Mindmap', ANALYSIS_PROMPTS.mindmap.getPrompt(analysisInput))
            ];
            outcomes = await Promise.all(analysisPromises);
        }

        analysisResults.faq = outcomes[0].content;
        analysisResults.topics = outcomes[1].content;
        analysisResults.mindmap = outcomes[2].content;
    }
    
    try {
        // --- THIS IS THE FIX ---
        // The final status is ALWAYS 'completed' if the worker finishes.
        // The failure reason field will indicate if sub-tasks had issues.
        // This makes the document usable even if optional analyses fail.
        await KnowledgeSource.updateOne(
            { _id: sourceId },
            {
                $set: {
                    "analysis.faq": analysisResults.faq,
                    "analysis.topics": analysisResults.topics,
                    "analysis.mindmap": analysisResults.mindmap,
                    "status": "completed", // Always set to completed
                    "failureReason": allIndividualAnalysesSuccessful ? "" : "One or more optional analyses (e.g., mindmap) failed to generate, but the core content is ready."
                }
            }
        );
        // --- END OF FIX ---
        console.log(`${logPrefix} Analysis results stored in DB.`);
        return { success: allIndividualAnalysesSuccessful, message: `Analysis ${allIndividualAnalysesSuccessful ? 'completed' : 'completed with some failures'}.` };
    } catch (dbError) {
        console.error(`${logPrefix} DB Error storing analysis results:`, dbError);
        // If DB update fails, we should throw to indicate a critical failure
        throw new Error(`DB Error storing analysis: ${dbError.message}`);
    }
}


async function run() {
    const { sourceId, textForAnalysis, llmProvider, ollamaModel, apiKey, ollamaUrl } = workerData;
    let dbConnected = false;

    try {
        if (!process.env.MONGO_URI || !sourceId) {
            throw new Error("Worker started with incomplete data (MONGO_URI or sourceId missing).");
        }
        
        await connectDB(process.env.MONGO_URI);
        dbConnected = true;

        if (!textForAnalysis || textForAnalysis.trim() === '') {
            await KnowledgeSource.updateOne({ _id: sourceId }, {
                $set: { status: "failed", failureReason: "Analysis skipped: No text content was extracted." }
            });
        } else {
            await performFullAnalysis(
                sourceId, textForAnalysis, llmProvider, ollamaModel, apiKey, ollamaUrl
            );
        }

    } catch (error) {
        console.error(`[Analysis Worker] Critical error for sourceId '${sourceId}':`, error);
        if (dbConnected && sourceId) {
            try {
                await KnowledgeSource.updateOne(
                    { _id: sourceId },
                    { $set: { status: "failed", failureReason: `Critical worker error: ${error.message}` } }
                );
            } catch (dbUpdateError) {
                console.error(`[Analysis Worker] Failed to update status to 'failed_critical':`, dbUpdateError);
            }
        }
    } finally {
        if (dbConnected) {
            await mongoose.disconnect();
        }
        console.log(`[Analysis Worker] Finished task for sourceId ${sourceId}.`);
    }
}

run();