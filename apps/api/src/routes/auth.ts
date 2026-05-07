import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditLog } from "../audit.js";
import {
  clearSession,
  createSession,
  getSessionUser,
  hashPassword,
  requireAuth,
  serializeUser,
  verifyPassword,
} from "../auth.js";
import { prisma } from "../db.js";
import { ApiError } from "../errors.js";
import { Role, type Prisma } from "../generated/prisma/client.js";
import { localeToPrisma } from "./helpers.js";
import { emailSchema, localeSchema, passwordSchema } from "./schemas.js";

export function registerAuthRoutes(app: FastifyInstance) {
  const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional(),
    preferredLocale: localeSchema.optional(),
  });

  const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1),
  });

  const profileSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    preferredLocale: localeSchema.optional(),
  });

  const passwordUpdateSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  });

  app.post("/auth/register", async (request, reply) => {
    const data = registerSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered");
    }

    const createData: Prisma.UserCreateInput = {
      email: data.email,
      passwordHash: await hashPassword(data.password),
      name: data.name,
      preferredLocale: localeToPrisma(data.preferredLocale ?? "en"),
      role: Role.PATIENT,
      patientProfile: {
        create: {},
      },
    };
    if (data.phone !== undefined) createData.phone = data.phone;

    const user = await prisma.user.create({
      data: createData,
      include: {
        patientProfile: true,
        workerProfile: true,
      },
    });

    await auditLog({
      actorId: user.id,
      action: "auth.register",
      entityType: "user",
      entityId: user.id,
    });
    await createSession(reply, user.id);

    return { user: serializeUser(user) };
  });

  app.post("/auth/login", async (request, reply) => {
    const data = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        patientProfile: true,
        workerProfile: true,
      },
    });

    if (!user || !user.active || !(await verifyPassword(user.passwordHash, data.password))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    await auditLog({
      actorId: user.id,
      action: "auth.login",
      entityType: "user",
      entityId: user.id,
    });
    await createSession(reply, user.id);

    return { user: serializeUser(user) };
  });

  app.post("/auth/logout", async (request, reply) => {
    const user = await getSessionUser(request);
    await clearSession(request, reply);
    if (user) {
      await auditLog({
        actorId: user.id,
        action: "auth.logout",
        entityType: "user",
        entityId: user.id,
      });
    }
    return { ok: true };
  });

  app.get("/auth/me", async (request) => {
    const user = await getSessionUser(request);
    return { user: user ? serializeUser(user) : null };
  });

  app.patch("/auth/me/profile", async (request) => {
    const user = await requireAuth(request);
    const data = profileSchema.parse(request.body);
    const updateData: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.preferredLocale !== undefined) {
      updateData.preferredLocale = localeToPrisma(data.preferredLocale);
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      include: {
        patientProfile: true,
        workerProfile: true,
      },
    });

    await auditLog({
      actorId: user.id,
      action: "user.updateOwnProfile",
      entityType: "user",
      entityId: user.id,
    });

    return { user: serializeUser(updated) };
  });

  app.patch("/auth/me/password", async (request) => {
    const user = await requireAuth(request);
    const data = passwordUpdateSchema.parse(request.body);
    const fullUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(fullUser.passwordHash, data.currentPassword))) {
      throw new ApiError(400, "CURRENT_PASSWORD_INVALID", "Current password is invalid");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(data.newPassword),
        sessions: {
          deleteMany: {},
        },
      },
    });

    await auditLog({
      actorId: user.id,
      action: "user.updateOwnPassword",
      entityType: "user",
      entityId: user.id,
    });

    return { ok: true };
  });
}
