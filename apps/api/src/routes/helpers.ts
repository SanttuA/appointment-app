import { ApiError } from "../errors.js";
import { Locale } from "../generated/prisma/client.js";

export function localeToPrisma(locale: "en" | "fi") {
  return locale === "fi" ? Locale.FI : Locale.EN;
}

export function prismaLocaleToUi(locale: Locale) {
  return locale.toLowerCase();
}

export function parseDate(value: string, code: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, code, "Invalid date");
  }
  return date;
}

export function definedEntries<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Record<string, unknown>;
}
