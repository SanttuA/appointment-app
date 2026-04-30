import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, mapError } from "../src/errors.js";

describe("error mapping", () => {
  it("returns stable error codes for API errors", () => {
    const mapped = mapError(new ApiError(403, "FORBIDDEN", "Forbidden"));
    expect(mapped).toMatchObject({
      statusCode: 403,
      body: {
        error: {
          code: "FORBIDDEN",
        },
      },
    });
  });

  it("returns validation errors in a localizable envelope", () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: "bad" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const mapped = mapError(result.error);
      expect(mapped.statusCode).toBe(400);
      expect(mapped.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it.each(["password", "newPassword"])(
    "returns a stable weak-password code for short %s values",
    (field) => {
      const result = z.object({ [field]: z.string().min(10) }).safeParse({ [field]: "short" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const mapped = mapError(result.error);
        expect(mapped.statusCode).toBe(400);
        expect(mapped.body.error).toMatchObject({
          code: "PASSWORD_TOO_WEAK",
          message: "Password must be at least 10 characters",
          params: { minimum: 10 },
        });
      }
    },
  );

  it("keeps login password presence checks as generic validation errors", () => {
    const result = z.object({ password: z.string().min(1) }).safeParse({ password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const mapped = mapError(result.error);
      expect(mapped.statusCode).toBe(400);
      expect(mapped.body.error.code).toBe("VALIDATION_FAILED");
    }
  });
});
