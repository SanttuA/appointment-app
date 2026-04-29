import { z } from "zod";

const boolFromString = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().default("file:./prisma/local/dev.db"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .default("development-session-secret-change-before-production"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: boolFromString.default(false),
});

export const env = envSchema.parse(process.env);

export type AppEnv = typeof env;
