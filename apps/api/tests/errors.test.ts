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
});
