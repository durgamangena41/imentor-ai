const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { hasGeminiApiKeys, isGeminiRateLimitError, runWithGeminiKeyRotation } = require('../services/geminiKeyRotationService');

const { crawlUrl } = require('../services/webCrawlerService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const DEFAULT_GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  process.env.GEMINI_MODEL_NAME,
  'gemini-2.0-flash',
].filter(Boolean);
const PYTHON_RAG_URL = process.env.PYTHON_RAG_SERVICE_URL;
const TEMP_DIR = path.join(os.tmpdir(), 'imentor-ai-summarizer');

const FORMAT_LABELS = {
  bullets: 'Bullet Points',
  paragraph: 'Paragraph',
  numbered: 'Numbered List',
  cornell: 'Cornell Notes',
  tweet: 'Tweet',
};

const LENGTH_GUIDANCE = {
  short: 'Keep the answer concise and focused.',
  medium: 'Provide a balanced summary with enough detail to understand the key ideas.',
  detailed: 'Provide a fuller summary that still stays tightly focused on the source text.',
};

const FALLBACK_SENTENCE_LIMITS = {
  short: 3,
  medium: 5,
  detailed: 8,
};

function normalizeFormat(value) {
  const normalized = String(value || 'bullets').toLowerCase();
  return Object.prototype.hasOwnProperty.call(FORMAT_LABELS, normalized) ? normalized : 'bullets';
}

function normalizeLength(value) {
  const normalized = String(value || 'medium').toLowerCase();
  return ['short', 'medium', 'detailed'].includes(normalized) ? normalized : 'medium';
}

function cleanModelText(text) {
  return String(text || '')
    .replace(/^```(?:json|markdown|md)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function extractJsonObject(text) {
  const cleaned = cleanModelText(text);
  const startIndex = cleaned.indexOf('{');
  const endIndex = cleaned.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('Gemini did not return valid JSON for Cornell notes.');
  }

  const jsonText = cleaned.slice(startIndex, endIndex + 1);
  return JSON.parse(jsonText);
}

function splitIntoSentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
}

function normalizeWord(word) {
  return String(word || '')
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    .replace(/'s$/i, '');
}

function getStopWords() {
  return new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'your', 'have', 'are', 'was', 'were', 'into', 'about',
    'there', 'their', 'them', 'they', 'you', 'your', 'but', 'not', 'can', 'could', 'would', 'should', 'will',
    'then', 'than', 'when', 'what', 'which', 'where', 'who', 'whom', 'why', 'how', 'all', 'any', 'each', 'few',
    'more', 'most', 'some', 'such', 'only', 'very', 'has', 'had', 'also', 'may', 'might', 'must', 'been', 'being',
    'over', 'under', 'between', 'during', 'while', 'after', 'before', 'because', 'through', 'about', 'among'
  ]);
}

function getWordFrequencies(text) {
  const stopWords = getStopWords();
  const words = String(text || '')
    .split(/\s+/)
    .map(normalizeWord)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  const frequencies = new Map();
  for (const word of words) {
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  }

  return frequencies;
}

function scoreSentence(sentence, frequencies) {
  return String(sentence || '')
    .split(/\s+/)
    .map(normalizeWord)
    .filter((word) => word.length > 2)
    .reduce((score, word) => score + (frequencies.get(word) || 0), 0);
}

function selectBestSentences(text, count) {
  const sentences = splitIntoSentences(text);
  if (!sentences.length) {
    return [];
  }

  if (sentences.length <= count) {
    return sentences;
  }

  const frequencies = getWordFrequencies(text);
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: scoreSentence(sentence, frequencies),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index);

  return ranked.map((item) => item.sentence);
}

function buildKeywordList(text, limit = 6) {
  const stopWords = getStopWords();
  const frequencies = getWordFrequencies(text);
  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .filter((word) => !stopWords.has(word))
    .slice(0, limit);
}

function splitIntoChunks(items, parts) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return [];
  const chunkSize = Math.max(1, Math.ceil(safeItems.length / parts));
  const chunks = [];
  for (let index = 0; index < safeItems.length; index += chunkSize) {
    chunks.push(safeItems.slice(index, index + chunkSize));
  }
  return chunks;
}

function createFallbackTweet(text) {
  const firstSentence = selectBestSentences(text, 1)[0] || String(text || '').replace(/\s+/g, ' ').trim();
  const compact = firstSentence.length > 280 ? `${firstSentence.slice(0, 277).trimEnd()}...` : firstSentence;
  return compact;
}

function createFallbackCornell(text, length) {
  const sentenceCount = FALLBACK_SENTENCE_LIMITS[length] || FALLBACK_SENTENCE_LIMITS.medium;
  const mainNotes = selectBestSentences(text, Math.max(4, Math.min(8, sentenceCount + 1)));
  const keywords = buildKeywordList(text, 6);
  const keyQuestions = (keywords.length ? keywords : buildKeywordList(text, 4)).map((word) => `What is the role of ${word} in the text?`);
  const summarySentences = selectBestSentences(text, Math.max(2, Math.min(3, sentenceCount)));

  return {
    mainNotes: mainNotes.length ? mainNotes.map((item) => item.replace(/\s+/g, ' ').trim()) : ['No strong note points could be extracted.'],
    keyQuestions: keyQuestions.length ? keyQuestions : ['What are the main ideas in the source text?'],
    summary: summarySentences.join(' ').replace(/\s+/g, ' ').trim() || 'No concise summary could be extracted.',
  };
}

function createFallbackBullets(text, length) {
  const sentenceCount = FALLBACK_SENTENCE_LIMITS[length] || FALLBACK_SENTENCE_LIMITS.medium;
  const sentences = selectBestSentences(text, sentenceCount);
  const bullets = [];
  const keywords = buildKeywordList(text, 1);

  if (keywords[0]) {
    bullets.push(`Main idea: ${keywords[0]}`);
  }

  sentences.forEach((sentence) => {
    if (bullets.length < sentenceCount + 1) {
      bullets.push(sentence.replace(/\s+/g, ' ').trim());
    }
  });

  const lines = bullets.length ? bullets : [String(text || '').split(/\s+/).slice(0, 20).join(' ')];
  return lines.map((item) => `- ${item}`).join('\n');
}

function createFallbackNumbered(text, length) {
  const sentenceCount = FALLBACK_SENTENCE_LIMITS[length] || FALLBACK_SENTENCE_LIMITS.medium;
  const sentences = selectBestSentences(text, sentenceCount);
  const lines = sentences.length ? sentences : splitIntoSentences(text).slice(0, sentenceCount);

  if (!lines.length) {
    return `1. ${String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160)}`;
  }

  return lines.map((line, index) => `${index + 1}. ${line.replace(/\s+/g, ' ').trim()}`).join('\n');
}

function createFallbackParagraph(text, length) {
  const sentenceCount = FALLBACK_SENTENCE_LIMITS[length] || FALLBACK_SENTENCE_LIMITS.medium;
  const sentences = selectBestSentences(text, sentenceCount);

  if (!sentences.length) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  if (sentences.length <= 2) {
    return sentences.join(' ').replace(/\s+/g, ' ').trim();
  }

  const chunks = splitIntoChunks(sentences, 3).map((chunk) => chunk.join(' ').replace(/\s+/g, ' ').trim());
  return chunks.filter(Boolean).join('\n\n');
}

function createLocalSummary(text, format, length) {
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim();

  if (format === 'cornell') {
    return createFallbackCornell(normalizedText, length);
  }

  if (format === 'tweet') {
    return createFallbackTweet(normalizedText);
  }

  if (format === 'numbered') {
    return createFallbackNumbered(normalizedText, length);
  }

  if (format === 'paragraph') {
    return createFallbackParagraph(normalizedText, length);
  }

  return createFallbackBullets(normalizedText, length);
}

async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

async function extractTextLocally(filePath, originalName) {
  const extension = path.extname(originalName || filePath).toLowerCase();

  if (extension === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const parsed = await pdfParse(buffer);
    return String(parsed.text || '').trim();
  }

  return (await fs.readFile(filePath, 'utf8')).trim();
}

async function extractTextFromPythonService(tempFilePath, originalName, userId) {
  if (!PYTHON_RAG_URL || !userId) {
    return null;
  }

  try {
    const response = await axios.post(
      `${PYTHON_RAG_URL}/add_document`,
      {
        user_id: userId,
        file_path: tempFilePath,
        original_name: originalName,
      },
      { timeout: 120000 }
    );

    const text = response.data?.raw_text_for_analysis || response.data?.text_content || '';
    return String(text || '').trim();
  } catch (error) {
    return null;
  }
}

function buildPrompt({ text, format, length }) {
  const formatLabel = FORMAT_LABELS[format] || FORMAT_LABELS.bullets;
  const lengthInstruction = LENGTH_GUIDANCE[length] || LENGTH_GUIDANCE.medium;

  if (format === 'cornell') {
    return `You are an expert note-taking assistant.

Summarize the content below using the Cornell note-taking format.

Requirements:
- Return ONLY valid JSON.
- Use this exact shape: {"mainNotes": ["..."], "keyQuestions": ["..."], "summary": "..."}
- mainNotes should contain 5-8 concise note bullets.
- keyQuestions should contain 4-7 study questions.
- summary should be a short wrap-up paragraph.
- ${lengthInstruction}
- Do not include markdown fences or any extra commentary.

Content:
${text}`;
  }

  if (format === 'tweet') {
    return `You are an expert summarizer.

Write a ${formatLabel.toLowerCase()} that captures the core idea of the text below.

Requirements:
- Keep the final answer at 280 characters or fewer.
- ${lengthInstruction}
- Return only the final summary text.

Content:
${text}`;
  }

  if (format === 'numbered') {
    return `You are an expert summarizer.

Summarize the content below as a numbered list of key facts.

Requirements:
- Use 5-8 numbered items.
- Each item should be concise and informative.
- ${lengthInstruction}
- Return only the list.

Content:
${text}`;
  }

  if (format === 'paragraph') {
    return `You are an expert summarizer.

Summarize the content below as 2-3 cohesive paragraphs.

Requirements:
- Keep the flow smooth and academic.
- ${lengthInstruction}
- Return only the paragraphs.

Content:
${text}`;
  }

  return `You are an expert summarizer.

Summarize the content below as bullet points.

Requirements:
- Include the main idea followed by 5-8 key supporting points.
- Use clear bullet points.
- ${lengthInstruction}
- Return only the bullet list.

Content:
${text}`;
}

async function summarizeWithGemini(text, format, length) {
  if (!hasGeminiApiKeys()) {
    throw new Error('Gemini API keys are not configured. Set GEMINI_API_KEY_1..GEMINI_API_KEY_5 (or GEMINI_API_KEY).');
  }
  const prompt = buildPrompt({ text, format, length });

  let lastError = null;
  for (const modelName of DEFAULT_GEMINI_MODELS) {
    try {
      const result = await runWithGeminiKeyRotation(async (apiKey) => {
        const generativeAI = new GoogleGenerativeAI(apiKey);
        const model = generativeAI.getGenerativeModel({ model: modelName });
        return model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          },
        });
      });

      const rawText = result.response.text();

      if (format === 'cornell') {
        const parsed = extractJsonObject(rawText);
        return {
          mainNotes: Array.isArray(parsed.mainNotes) ? parsed.mainNotes : [],
          keyQuestions: Array.isArray(parsed.keyQuestions) ? parsed.keyQuestions : [],
          summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        };
      }

      const cleaned = cleanModelText(rawText);
      if (format === 'tweet' && cleaned.length > 280) {
        return `${cleaned.slice(0, 277).trimEnd()}...`;
      }

      return cleaned;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || '');
      if (!/404 Not Found|not found for API version|not supported for generateContent/i.test(message)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('No supported Gemini model could generate a summary.');
}

async function summarizeTextPayload(text, format, length) {
  if (!String(text || '').trim()) {
    throw new Error('Text is required for summarization.');
  }

  const trimmedText = text.trim().slice(0, 40000);

  try {
    return await summarizeWithGemini(trimmedText, format, length);
  } catch (error) {
    if (!hasGeminiApiKeys() || isGeminiRateLimitError(error)) {
      return createLocalSummary(trimmedText, format, length);
    }

    throw error;
  }
}

router.post('/text', async (req, res) => {
  try {
    const format = normalizeFormat(req.body?.format);
    const length = normalizeLength(req.body?.length);
    const text = String(req.body?.text || '').trim();

    if (!text) {
      return res.status(400).json({ message: 'Text is required.' });
    }

    const summary = await summarizeTextPayload(text, format, length);

    return res.json({
      success: true,
      sourceType: 'text',
      format,
      length,
      summary,
      generationMode: typeof summary === 'string' ? (hasGeminiApiKeys() ? 'gemini' : 'local') : 'local',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to summarize text.' });
  }
});

router.post('/file', upload.single('file'), async (req, res) => {
  let tempFilePath = null;

  try {
    const format = normalizeFormat(req.body?.format);
    const length = normalizeLength(req.body?.length);
    const file = req.file;
    const userId = req.user?.id || req.user?._id;

    if (!file) {
      return res.status(400).json({ message: 'File is required.' });
    }

    await ensureTempDir();
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    tempFilePath = path.join(TEMP_DIR, safeName);
    await fs.writeFile(tempFilePath, file.buffer);

    let extractedText = await extractTextFromPythonService(tempFilePath, file.originalname, userId);

    if (!extractedText) {
      extractedText = await extractTextLocally(tempFilePath, file.originalname);
    }

    if (!extractedText) {
      return res.status(422).json({ message: 'Could not extract text from the uploaded file.' });
    }

    const summary = await summarizeTextPayload(extractedText, format, length);

    return res.json({
      success: true,
      sourceType: 'file',
      format,
      length,
      summary,
      generationMode: typeof summary === 'string' ? (hasGeminiApiKeys() ? 'gemini' : 'local') : 'local',
      extractedCharacters: extractedText.length,
      filename: file.originalname,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to summarize file.' });
  } finally {
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => {});
    }
  }
});

router.post('/url', async (req, res) => {
  try {
    const format = normalizeFormat(req.body?.format);
    const length = normalizeLength(req.body?.length);
    const url = String(req.body?.url || '').trim();

    if (!url) {
      return res.status(400).json({ message: 'URL is required.' });
    }

    const crawlResult = await crawlUrl(url);
    if (!crawlResult?.success) {
      return res.status(422).json({ message: crawlResult?.error || 'Could not extract text from the URL.' });
    }

    const extractedText = String(crawlResult.text || '').trim();
    if (!extractedText) {
      return res.status(422).json({ message: 'The URL did not yield enough text to summarize.' });
    }

    const summary = await summarizeTextPayload(extractedText, format, length);

    return res.json({
      success: true,
      sourceType: 'url',
      format,
      length,
      summary,
      generationMode: typeof summary === 'string' ? (GEMINI_API_KEY ? 'gemini' : 'local') : 'local',
      title: crawlResult.title || url,
      url,
      extractedCharacters: extractedText.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to summarize URL.' });
  }
});

module.exports = router;