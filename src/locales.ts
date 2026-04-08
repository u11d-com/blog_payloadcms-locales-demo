import { TypedLocale } from "payload";

export const AVAILABLE_LOCALES: string[] = ["en", "es"];
export const LOCALES_WITHOUT_EN = AVAILABLE_LOCALES.filter(
  (value) => value !== "en",
);

export const isValidLocale = (value: unknown): value is TypedLocale =>
  typeof value === "string" && AVAILABLE_LOCALES.includes(value);
