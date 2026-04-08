import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { Resources } from "./collections/Resources";
import { Users } from "./collections/Users";
import { translateJob } from "./jobs/translate";
import { AVAILABLE_LOCALES } from "./locales";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: "users",
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

  // ── Localization config (article Layer 1) ──────────────────────────────────
  localization: {
    locales: AVAILABLE_LOCALES,
    defaultLocale: "en",
    fallback: true,
  },

  // ── Jobs config for auto-translation ───────────────────────────────────────
  jobs: {
    tasks: [translateJob],
    autoRun: [
      {
        queue: "translation",
        cron: "* * * * *",
      },
    ],
  },

  collections: [Users, Resources],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "dev-secret-change-me",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || "file:./payload.db",
    },
  }),
});
