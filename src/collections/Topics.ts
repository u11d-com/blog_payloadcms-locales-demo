import type { CollectionConfig } from "payload";

export const Topics: CollectionConfig = {
  slug: "topics",
  admin: {
    useAsTitle: "title",
  },
  fields: [
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
  ],
};
