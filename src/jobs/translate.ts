import { CollectionSlug, TaskConfig, TypedLocale } from "payload";
import { batchTranslate } from "../services/translationService";
import { retry } from "radash";
import { isValidLocale } from "@/locales";
import { Topic } from "@/payload-types";

type CollectionDocTypes = {
  topics: Topic;
  // users: User; // Add when implementing user translations
  // [key: string]: never; // Prevent unmapped collections at compile time
};

type SupportedCollectionSlug = keyof CollectionDocTypes;

interface FieldToTranslate {
  path: string;
  value: string;
  locale: string;
  id?: string;
}

interface FieldsExtractor<T extends SupportedCollectionSlug> {
  (args: {
    englishDoc: CollectionDocTypes[T];
    targetDoc: CollectionDocTypes[T];
    force: boolean;
    targetLocale: TypedLocale;
  }): FieldToTranslate[];
}

interface UpdateDataBuilder<T extends SupportedCollectionSlug> {
  (args: {
    englishDoc: CollectionDocTypes[T];
    targetDoc: CollectionDocTypes[T];
    translationsByPath: Record<string, string>;
  }): Partial<CollectionDocTypes[T]>;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function shouldTranslate(
  force: boolean | null | undefined,
  sourceValue: string | undefined | null,
  targetValue: string | undefined | null,
) {
  if (isEmpty(sourceValue)) return false;
  if (force) return true;
  return isEmpty(targetValue);
}

type GetFieldsToTranslateArgs = {
  jobId: number;
  slug: CollectionSlug;
  targetLocale: TypedLocale;
  englishDoc: unknown;
  targetDoc: unknown;
  force: boolean;
};

const extractTopicFieldsToTranslate: FieldsExtractor<"topics"> = ({
  englishDoc,
  targetDoc,
  force,
  targetLocale,
}) => {
  const fieldsToTranslate: FieldToTranslate[] = [];

  if (englishDoc.title) {
    if (shouldTranslate(force, englishDoc.title, targetDoc.title)) {
      fieldsToTranslate.push({
        path: "title",
        value: englishDoc.title,
        locale: targetLocale,
      });
    }
  }

  if (Array.isArray(englishDoc.list)) {
    englishDoc.list.forEach((englishItem, index) => {
      if (!englishItem.id) return;

      const targetItem = Array.isArray(targetDoc.list)
        ? targetDoc.list.find((t) => t.id === englishItem.id)
        : null;

      if (
        englishItem.name &&
        shouldTranslate(force, englishItem.name, targetItem?.name)
      ) {
        fieldsToTranslate.push({
          path: `list.${index}.name`,
          value: englishItem.name,
          locale: targetLocale,
          id: englishItem.id,
        });
      }
    });
  }

  return fieldsToTranslate;
};

const fieldsExtractors: {
  [K in SupportedCollectionSlug]: FieldsExtractor<K>;
} = {
  topics: extractTopicFieldsToTranslate,
};

function getFieldsToTranslate({
  jobId,
  slug,
  targetLocale,
  englishDoc,
  targetDoc,
  force,
}: GetFieldsToTranslateArgs): FieldToTranslate[] {
  const extractor = fieldsExtractors[slug as SupportedCollectionSlug];

  if (extractor) {
    return extractor({
      // Type assertion is safe here because:
      // 1. Documents come from Payload's generic system (typed as unknown)
      // 2. The registry ensures each slug maps to correctly typed extractor
      // 3. Runtime slug lookup guarantees type alignment
      englishDoc: englishDoc as any,
      targetDoc: targetDoc as any,
      force,
      targetLocale,
    });
  }

  // When adding new collections:
  // 1. Add type to CollectionDocTypes
  // 2. Create extractor function with FieldsExtractor<"collectionName"> type
  // 3. Add to fieldsExtractors registry

  console.warn(
    `[Job ${jobId}] Translations are not supported for slug: ${slug}`,
  );

  return [];
}

const buildTopicUpdateData: UpdateDataBuilder<"topics"> = ({
  englishDoc,
  targetDoc,
  translationsByPath,
}) => {
  const updateData: Partial<Topic> = {
    ...targetDoc,
  };

  if (translationsByPath["title"]) {
    updateData.title = translationsByPath["title"];
  } else if (isEmpty(targetDoc.title) && englishDoc.title) {
    updateData.title = englishDoc.title;
  }

  if (Array.isArray(englishDoc.list)) {
    const targetItemsById = new Map(
      Array.isArray(targetDoc.list)
        ? targetDoc.list.map((item) => [item.id, item])
        : [],
    );

    updateData.list = englishDoc.list.map((englishItem, index) => {
      const targetItem = targetItemsById.get(englishItem.id);
      const mergedItem = {
        ...englishItem,
        ...(targetItem || {}),
        id: englishItem.id,
      };

      const namePath = `list.${index}.name`;
      if (translationsByPath[namePath]) {
        mergedItem.name = translationsByPath[namePath];
      } else if (isEmpty(targetItem?.name) && englishItem.name) {
        mergedItem.name = englishItem.name;
      }

      return mergedItem;
    });
  }

  return updateData;
};

const updateDataBuilders: {
  [K in SupportedCollectionSlug]: UpdateDataBuilder<K>;
} = {
  topics: buildTopicUpdateData,
};

type GetUpdateDataArgs = {
  slug: CollectionSlug;
  englishDoc: unknown;
  targetDoc: unknown;
  translationsByPath: Record<string, string>;
};

function getUpdateData({
  slug,
  englishDoc,
  targetDoc,
  translationsByPath,
}: GetUpdateDataArgs) {
  const builder = updateDataBuilders[slug as SupportedCollectionSlug];

  if (builder) {
    return builder({
      // Type assertion is safe here because:
      // 1. Documents come from Payload's generic system (typed as unknown)
      // 2. The registry ensures each slug maps to correctly typed builder
      // 3. Runtime slug lookup guarantees type alignment
      englishDoc: englishDoc as any,
      targetDoc: targetDoc as any,
      translationsByPath,
    });
  }

  // When adding new collections:
  // 1. Add type to CollectionDocTypes
  // 2. Create builder function with UpdateDataBuilder<"collectionName"> type
  // 3. Add to updateDataBuilders registry

  console.warn(`Update data mapper not implemented for slug: ${slug}`);
  return null;
}

async function executeBatchTranslation(
  fields: FieldToTranslate[],
): Promise<Record<string, string>> {
  const BATCH_SIZE_AZURE = 100;
  const translationsByPath: Record<string, string> = {};

  for (let i = 0; i < fields.length; i += BATCH_SIZE_AZURE) {
    const batch = fields.slice(i, i + BATCH_SIZE_AZURE);
    const translations = await retry({ times: 3, delay: 1000 }, () =>
      batchTranslate(
        batch.map((f) => ({
          id: f.path,
          text: f.value,
          targetLocale: f.locale,
        })),
      ),
    );
    translations.forEach((t) => {
      if (t?.id) translationsByPath[t.id] = t.translatedText;
    });
  }

  return translationsByPath;
}

export const translateJob: TaskConfig<"translate"> = {
  slug: "translate",
  inputSchema: [
    {
      name: "collectionSlug",
      type: "text",
      required: true,
    },
    {
      name: "documentId",
      type: "text",
      required: true,
    },
    {
      name: "locales",
      type: "array",
      required: true,
      fields: [
        {
          name: "locale",
          type: "text",
        },
      ],
    },
    {
      name: "force",
      type: "checkbox",
      defaultValue: false,
    },
  ],
  outputSchema: [
    {
      name: "success",
      type: "checkbox",
      required: true,
    },
    {
      name: "translated",
      type: "number",
      required: true,
    },
    {
      name: "details",
      type: "json",
    },
  ],
  handler: async ({ input, job, req }) => {
    const { payload } = req;
    const { collectionSlug, documentId, force } = input;
    const locales = input.locales.map(({ locale }) => locale);
    const typedCollectionSlug = collectionSlug as CollectionSlug;

    console.log(
      `[Job ${job.id}] Translation started for ${collectionSlug}:${documentId}`,
      { locales, force },
    );

    try {
      const englishDoc = await payload.findByID({
        collection: typedCollectionSlug,
        id: documentId,
        locale: "en",
        depth: 0,
      });

      if (!englishDoc) {
        throw new Error(`Document not found: ${collectionSlug}:${documentId}`);
      }

      const totalTranslatedCounts: Record<string, number> = {};

      for (const targetLocale of locales) {
        if (targetLocale === "en") continue;

        console.log(`[Job ${job.id}] Processing locale: ${targetLocale}`);

        if (!isValidLocale(targetLocale)) {
          console.warn(`[Job ${job.id}] Invalid locale: ${targetLocale}`);
          continue;
        }

        const targetDoc = await payload.findByID({
          collection: typedCollectionSlug,
          id: documentId,
          locale: targetLocale,
        });

        const fieldsToTranslate = getFieldsToTranslate({
          jobId: job.id,
          englishDoc,
          slug: typedCollectionSlug,
          targetDoc,
          targetLocale,
          force: force || false,
        });

        if (fieldsToTranslate.length === 0) {
          console.log(
            `[Job ${job.id}] No fields to translate for locale ${targetLocale}`,
          );
          continue;
        }

        console.log(
          `[Job ${job.id}] Translating ${fieldsToTranslate.length} fields for ${targetLocale}`,
        );

        const translationsByPath =
          await executeBatchTranslation(fieldsToTranslate);

        const updateData = getUpdateData({
          slug: typedCollectionSlug,
          englishDoc,
          targetDoc,
          translationsByPath,
        });

        if (!updateData) {
          console.warn(
            `[Job ${job.id}] No update data generated for slug: ${typedCollectionSlug}`,
          );
          continue;
        }

        updateData._translationMeta = {
          lastTranslatedAt: new Date().toISOString(),
          translatedBy: "auto",
        };

        await payload.update({
          collection: typedCollectionSlug,
          id: documentId,
          locale: targetLocale,
          data: updateData,
        });

        totalTranslatedCounts[targetLocale] = fieldsToTranslate.length;
      }

      const totalTranslated = Object.values(totalTranslatedCounts).reduce(
        (a, b) => a + b,
        0,
      );

      console.log(
        `[Job ${job.id}] Translation completed. Total fields translated: ${totalTranslated}`,
        totalTranslatedCounts,
      );

      return {
        output: {
          success: true,
          translated: totalTranslated,
          details: totalTranslatedCounts,
        },
      };
    } catch (error) {
      console.error(`[Job ${job.id}] Translation failed:`, error);
      throw error;
    }
  },
};
