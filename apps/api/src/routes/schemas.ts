import { z } from "zod";

export const passwordSchema = z.string().min(10).max(200);
export const localeSchema = z.enum(["en", "fi"]).default("en");
export const emailSchema = z.string().trim().email().toLowerCase();
export const idParamsSchema = z.object({ id: z.string().min(1) });
