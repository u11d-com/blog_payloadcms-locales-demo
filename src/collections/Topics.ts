import type { CollectionConfig } from "payload";

export const Topics: CollectionConfig = {
  slug: "topics",
  admin: {
    useAsTitle: "title",
  },
  fields: [
    {
      type: "ui",
      name: "translateButton",
      admin: {
        position: "above",
        components: {
          Field: "@/components/TranslateButton",
        },
      },
    },
    {
      name: "title",
      type: "text",
      localized: true,
      required: true,
      admin: {
        components: {
          Field: "@/components/LocalizedTextField",
        },
      },
    },
    {
      name: "list",
      type: "array",
      fields: [
        {
          name: "name",
          type: "text",
          localized: true,
          admin: {
            components: {
              Field: "@/components/LocalizedTextField",
            },
          },
        },
      ],
    },
    {
      name: "_translationMeta",
      type: "group",
      admin: {
        description: "Metadata about automatic translations",
        condition: (_, siblingData) => !!siblingData._translationMeta,
      },
      fields: [
        {
          name: "lastTranslatedAt",
          type: "date",
          admin: {
            readOnly: true,
          },
        },
        {
          name: "translatedBy",
          type: "text",
          admin: {
            readOnly: true,
          },
        },
      ],
    },
  ],
};
