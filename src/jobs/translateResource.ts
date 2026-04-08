import { TaskConfig, TypedLocale } from "payload";
import { batchTranslate } from "../services/translationService";
import { retry } from "radash";
import { isValidLocale } from "@/locales";
import { Resource } from "@/payload-types";

interface FieldToTranslate {
  path: string;
  value: string;
  locale: string;
  id?: string;
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function shouldTranslate(
  force: boolean,
  sourceValue: string | null | undefined,
  targetValue: string | null | undefined,
): boolean {
  if (isEmpty(sourceValue)) return false;
  if (force) return true;
  return isEmpty(targetValue);
}

function extractFieldsToTranslate(
  englishDoc: Resource,
  targetDoc: Resource,
  force: boolean,
  targetLocale: TypedLocale,
): FieldToTranslate[] {
  const fieldsToTranslate: FieldToTranslate[] = [];

  if (shouldTranslate(force, englishDoc.title, targetDoc.title)) {
    fieldsToTranslate.push({
      path: "title",
      value: englishDoc.title,
      locale: targetLocale,
    });
  }

  if (Array.isArray(englishDoc.list)) {
    englishDoc.list.forEach((englishItem, index) => {
      if (!englishItem.id) {
        return;
      }

      const targetItem = Array.isArray(targetDoc.list)
        ? targetDoc.list.find((t) => t.id === englishItem.id)
        : null;

      if (shouldTranslate(force, englishItem.name, targetItem?.name)) {
        fieldsToTranslate.push({
          path: `list.${index}.name`,
          value: englishItem.name!,
          locale: targetLocale,
          id: englishItem.id,
        });
      }
    });
  }

  return fieldsToTranslate;
}

function buildUpdateData(
  englishDoc: Resource,
  targetDoc: Resource,
  translationsByPath: Record<string, string>,
): Partial<Resource> {
  const updateData: Partial<Resource> = {
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

export const translateResourceJob: TaskConfig<"translateResource"> = {
  slug: "translateResource",
  inputSchema: [
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
    const { documentId, force } = input;
    const locales = input.locales.map(({ locale }) => locale);

    console.log(
      `[Job ${job.id}] Translation started for resources:${documentId}`,
      { locales, force },
    );

    try {
      const englishDoc = await payload.findByID({
        collection: "resources",
        id: documentId,
        locale: "en",
        depth: 0,
      });

      if (!englishDoc) {
        throw new Error(`Resource not found: ${documentId}`);
      }

      const totalTranslatedCounts: Record<string, number> = {};

      for (const targetLocale of locales) {
        if (targetLocale === "en") {
          continue;
        }

        console.log(`[Job ${job.id}] Processing locale: ${targetLocale}`);

        if (!isValidLocale(targetLocale)) {
          console.warn(`[Job ${job.id}] Invalid locale: ${targetLocale}`);
          continue;
        }

        const targetDoc = await payload.findByID({
          collection: "resources",
          id: documentId,
          locale: targetLocale,
        });

        const fieldsToTranslate = extractFieldsToTranslate(
          englishDoc,
          targetDoc,
          force || false,
          targetLocale,
        );

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

        const updateData = buildUpdateData(
          englishDoc,
          targetDoc,
          translationsByPath,
        );

        updateData._translationMeta = {
          lastTranslatedAt: new Date().toISOString(),
          translatedBy: "auto",
        };

        await payload.update({
          collection: "resources",
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
