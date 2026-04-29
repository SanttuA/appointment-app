import en from "../messages/en.json" with { type: "json" };
import fi from "../messages/fi.json" with { type: "json" };
import { describe, expect, it } from "vitest";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("translations", () => {
  it("keeps English and Finnish message keys in sync", () => {
    expect(flattenKeys(fi).sort()).toEqual(flattenKeys(en).sort());
  });
});
