import crypto from "crypto";
import TextTranslationClient, {
  isUnexpected,
} from "@azure-rest/ai-translation-text";
import { LRUCache } from "lru-cache";

export type TranslationEngine = "azure";

export interface TranslationResult {
  text: string;
  fromCache: boolean;
}

export interface BatchTranslationInput {
  id?: string;
  text: string;
  targetLocale: string;
}

export interface BatchTranslationResult {
  id?: string;
  text: string;
  translatedText: string;
  targetLocale: string;
  fromCache: boolean;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const translationCache = new LRUCache<string, string>({
  max: 10000,
  ttl: CACHE_TTL_MS,
  ttlAutopurge: true,
});

function createTextHash(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function createCacheKey(locale: string, englishText: string): string {
  const hash = createTextHash(englishText);
  return `${locale}:${hash}`;
}

async function translateWithAzure(
  texts: string[],
  targetLocale: string,
): Promise<string[]> {
  const apiKey = process.env.AZURE_TRANSLATOR_KEY;
  const endpoint =
    process.env.AZURE_TRANSLATOR_ENDPOINT ||
    "https://api.cognitive.microsofttranslator.com";
  const region = process.env.AZURE_TRANSLATOR_REGION || "global";

  if (!apiKey) {
    throw new Error(
      "AZURE_TRANSLATOR_KEY is not configured in environment variables",
    );
  }

  const client = TextTranslationClient(endpoint, {
    key: apiKey,
    region: region,
  });

  const inputText = texts.map((text) => ({ text }));
  const translateResponse = await client.path("/translate").post({
    body: inputText,
    queryParameters: {
      to: targetLocale,
      from: "en",
    },
  });

  if (isUnexpected(translateResponse)) {
    throw new Error(
      `Azure translation failed: ${translateResponse.body.error?.message || "Unknown error"}`,
    );
  }

  return translateResponse.body.map((item) => item.translations[0].text);
}

export async function batchTranslate(
  inputs: BatchTranslationInput[],
): Promise<BatchTranslationResult[]> {
  const results: BatchTranslationResult[] = new Array(inputs.length);

  const inputsWithIndex = inputs.map((input, index) => ({ input, index }));

  const byLocale = inputsWithIndex.reduce<
    Record<string, typeof inputsWithIndex>
  >((acc, item) => {
    if (!acc[item.input.targetLocale]) {
      acc[item.input.targetLocale] = [];
    }
    acc[item.input.targetLocale].push(item);
    return acc;
  }, {});

  for (const [locale, localeInputs] of Object.entries(byLocale)) {
    const textsToTranslate: string[] = [];
    const itemsToTranslate: typeof inputsWithIndex = [];

    for (const item of localeInputs) {
      const cacheKey = createCacheKey(locale, item.input.text);
      const cached = translationCache.get(cacheKey);

      if (cached) {
        results[item.index] = {
          id: item.input.id,
          text: item.input.text,
          translatedText: cached,
          targetLocale: locale,
          fromCache: true,
        };
      } else {
        textsToTranslate.push(item.input.text);
        itemsToTranslate.push(item);
      }
    }

    if (textsToTranslate.length > 0) {
      const BATCH_SIZE_AZURE = 100;

      for (let i = 0; i < textsToTranslate.length; i += BATCH_SIZE_AZURE) {
        const batch = textsToTranslate.slice(i, i + BATCH_SIZE_AZURE);
        const batchItems = itemsToTranslate.slice(i, i + BATCH_SIZE_AZURE);

        const translations = await translateWithAzure(batch, locale);

        for (let j = 0; j < translations.length; j++) {
          const item = batchItems[j];
          const translatedText = translations[j];
          const cacheKey = createCacheKey(locale, item.input.text);

          translationCache.set(cacheKey, translatedText);

          results[item.index] = {
            id: item.input.id,
            text: item.input.text,
            translatedText,
            targetLocale: locale,
            fromCache: false,
          };
        }
      }
    }
  }

  return results;
}

export async function translate(
  text: string,
  targetLocale: string,
): Promise<TranslationResult> {
  const results = await batchTranslate([{ text, targetLocale }]);
  const result = results[0];

  return {
    text: result.translatedText,
    fromCache: result.fromCache,
  };
}
