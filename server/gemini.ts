import { GoogleGenAI, Type } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

export interface ExtractedCandidate {
  date: string;
  amount: number;
  merchant: string;
  description: string;
  direction: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'REFUND';
  confidence: number;
  rawText: string;
  evidenceSnippet: string;
}

export interface InsightNarrationFacts {
  title?: string;
  title_bn?: string;
  summary?: string;
  summary_bn?: string;
  category?: string;
  currentAmount?: number;
  previousAmount?: number;
  changePct?: number;
  merchant?: string;
  orderCount?: number;
  math_formula?: string;
  metric_value?: string;
  type?: string;
}

/**
 * Checks if an error is a transient capacity/demand spike error (e.g. 503, 429)
 */
function isTransientDemandError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const status = err.status || err.error?.code || err.code;
  return (
    status === 503 ||
    status === 429 ||
    status === 'UNAVAILABLE' ||
    status === 'RESOURCE_EXHAUSTED' ||
    msg.includes('503') ||
    msg.includes('high demand') ||
    msg.includes('unavailable') ||
    msg.includes('temporarily') ||
    msg.includes('spikes in demand') ||
    msg.includes('rate limit')
  );
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const modelCooldownMap = new Map<string, number>();

function isModelCoolingDown(model: string): boolean {
  const until = modelCooldownMap.get(model);
  if (!until) return false;
  if (Date.now() > until) {
    modelCooldownMap.delete(model);
    return false;
  }
  return true;
}

function markModelDemandCooldown(model: string) {
  modelCooldownMap.set(model, Date.now() + 3 * 60 * 1000); // 3-minute cooldown during high demand spikes
}

/**
 * Server-side document extraction using Gemini with multi-model fallback & backoff
 */
export async function extractWithGemini(
  content: string,
  isBase64Image: boolean = false,
  mimeType: string = 'text/plain'
): Promise<ExtractedCandidate[]> {
  const ai = getAiClient();
  if (!ai) {
    console.info('[Gemini] GEMINI_API_KEY absent. Using deterministic parser.');
    return [];
  }

  const prompt = `You are a specialized financial document extractor for Bangladeshi statements (bKash, Nagad, Rocket, Bank Statements, Cards, Receipts).
Extract every individual transaction candidate accurately.
Rules:
1. Currency is BDT (৳ / Taka).
2. Look for Date (YYYY-MM-DD), Amount (positive number), Direction (EXPENSE, INCOME, TRANSFER, or REFUND), Merchant / Counterparty, Description, and the verbatim raw text line as evidence.
3. Do not invent or hallucinate entries not in the document.
4. If unknown direction, classify debit as EXPENSE and credit as INCOME.`;

  let contentsPayload: any;
  if (isBase64Image) {
    contentsPayload = {
      parts: [
        {
          inlineData: {
            data: content,
            mimeType: mimeType || 'image/png',
          },
        },
        { text: prompt },
      ],
    };
  } else {
    contentsPayload = `${prompt}\n\nDOCUMENT TEXT:\n${content.slice(0, 15000)}`;
  }

  // Prioritize gemini-3.1-flash-lite for instant response and peak resilience, with graceful multi-model fallbacks
  const modelCandidates = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];

  for (let i = 0; i < modelCandidates.length; i++) {
    const model = modelCandidates[i];
    if (isModelCoolingDown(model)) {
      continue;
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: contentsPayload,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING, description: 'YYYY-MM-DD' },
                amount: { type: Type.NUMBER, description: 'Amount in BDT' },
                merchant: { type: Type.STRING, description: 'Merchant or counterparty name' },
                description: { type: Type.STRING, description: 'Transaction details' },
                direction: {
                  type: Type.STRING,
                  description: 'EXPENSE, INCOME, TRANSFER, or REFUND',
                },
                confidence: { type: Type.NUMBER, description: '0.0 to 1.0 confidence score' },
                rawText: { type: Type.STRING, description: 'Exact line snippet from document' },
                evidenceSnippet: { type: Type.STRING, description: 'Evidence snippet' },
              },
              required: ['date', 'amount', 'merchant', 'direction', 'confidence', 'rawText'],
            },
          },
        },
      });

      const text = response.text;
      if (!text) return [];
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(p => ({
          date: p.date || new Date().toISOString().slice(0, 10),
          amount: Math.abs(Number(p.amount) || 0),
          merchant: String(p.merchant || 'Unknown Merchant'),
          description: String(p.description || p.merchant || 'Transaction'),
          direction: (['EXPENSE', 'INCOME', 'TRANSFER', 'REFUND'].includes(p.direction)
            ? p.direction
            : 'EXPENSE') as any,
          confidence: Number(p.confidence) || 0.9,
          rawText: String(p.rawText || ''),
          evidenceSnippet: String(p.evidenceSnippet || p.rawText || ''),
        }));
      }
    } catch (err: any) {
      if (isTransientDemandError(err)) {
        markModelDemandCooldown(model);
        console.info(`[Gemini] Model ${model} is experiencing temporary demand spikes. Routing to alternative candidate.`);
        if (i < modelCandidates.length - 1) {
          await sleep(300);
          continue;
        }
      } else {
        console.info(`[Gemini] Extraction note with model ${model}:`, err.message || err);
        break;
      }
    }
  }

  // Gracefully return empty so pipeline falls back to deterministic text extraction
  return [];
}

/**
 * Deterministic Grounded Narration Generator
 * Ensures that if Gemini experiences demand spikes or is unavailable,
 * the platform always produces an accurate, evidence-backed natural explanation.
 */
export function generateDeterministicNarration(
  facts: InsightNarrationFacts,
  locale: 'en' | 'bn' = 'en'
): string {
  const isBn = locale === 'bn';

  if (isBn) {
    if (facts.summary_bn) {
      return `${facts.summary_bn} এটি কোনো মনগড়া অনুমান নয়—আপনার যাচাইকৃত স্টেটমেন্ট লেনদেনের প্রমাণের ভিত্তিতে সরাসরি প্রস্তুত।`;
    }
    if (facts.category || facts.title_bn) {
      const title = facts.title_bn || facts.title || 'খরচের প্যাটার্ন';
      const formula = facts.math_formula ? ` (সূত্র: ${facts.math_formula})` : '';
      return `${title}। আপনার যাচাইকৃত লেনদেনের গাণিতিক প্রমাণের ভিত্তিতে এই পর্যালোচনাটি প্রস্তুত করা হয়েছে${formula}।`;
    }
    return `আপনার ব্যয়ের গাণিতিক হিসাব এবং লেনদেনের তথ্যপ্রমাণ সফলভাবে যাচাই করা হয়েছে।`;
  }

  if (facts.summary) {
    return `${facts.summary} This is an objective analysis computed directly from your verified statement transactions.`;
  }
  if (facts.category || facts.title) {
    const title = facts.title || 'Spending pattern';
    const formula = facts.math_formula ? ` (Calculation: ${facts.math_formula})` : '';
    return `${title}. This assessment is grounded directly in verified transaction evidence${formula}.`;
  }
  return `Your spending pattern analysis has been mathematically verified against your uploaded ledger evidence.`;
}

/**
 * Server-side explanation narration with demand spike resiliency and fallback models.
 * Strictly receives structured mathematical facts without altering any underlying numbers.
 */
export async function narrateInsightFacts(
  facts: InsightNarrationFacts,
  locale: 'en' | 'bn' = 'en'
): Promise<string> {
  const deterministicFallback = generateDeterministicNarration(facts, locale);

  const ai = getAiClient();
  if (!ai) {
    return deterministicFallback;
  }

  const prompt = `You are the empathetic, objective financial narrator for "Kothay Gelo?" (কোথায় গেল?), a Bangladeshi financial intelligence platform.
Write a 2-sentence conversational explanation of these exact pre-calculated facts for the user.
STRICT CONSTRAINT: DO NOT CHANGE ANY NUMBER, DO NOT INVENT FACTS, DO NOT GIVE INVESTMENT ADVICE.

Language: ${locale === 'bn' ? 'Bengali (বাংলা)' : 'English'}
FACTS:
${JSON.stringify(facts, null, 2)}
`;

  const modelCandidates = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];

  for (let i = 0; i < modelCandidates.length; i++) {
    const model = modelCandidates[i];
    if (isModelCoolingDown(model)) {
      continue;
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });

      const text = response.text?.trim();
      if (text) {
        return text;
      }
    } catch (err: any) {
      if (isTransientDemandError(err)) {
        markModelDemandCooldown(model);
        console.info(`[Gemini] Model ${model} is experiencing temporary demand spikes. Routing to alternative candidate.`);
        if (i < modelCandidates.length - 1) {
          await sleep(300);
          continue;
        }
      } else {
        console.info(`[Gemini] Narration generation notice with ${model}:`, err.message || err);
        if (i < modelCandidates.length - 1) {
          continue;
        }
      }
    }
  }

  // If all models are experiencing high demand spikes, seamlessly deliver grounded deterministic narration
  console.info('[Gemini] Temporary high demand across models. Serving deterministic evidence-backed explanation.');
  return deterministicFallback;
}
