import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditLog } from "../audit.js";
import { hashPassword, requireRole, serializeUser } from "../auth.js";
import { prisma } from "../db.js";
import { ApiError } from "../errors.js";
import { Role, type Prisma } from "../generated/prisma/client.js";
import { bookingHorizonDays } from "../scheduling.js";
import { definedEntries, localeToPrisma } from "./helpers.js";
import { emailSchema, idParamsSchema, localeSchema, passwordSchema } from "./schemas.js";
import { appointmentInclude, serializeAppointment, serializeService } from "./serializers.js";

export function registerAdminRoutes(app: FastifyInstance) {
  const userCreateSchema = z.object({
    email: emailSchema,
    password: passwordSchema.default("ChangeMe123!"),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional(),
    role: z.enum(["PATIENT", "WORKER", "ADMIN"]),
    preferredLocale: localeSchema.optional(),
    worker: z
      .object({
        title: z.string().trim().min(1).max(120).default("Healthcare worker"),
        location: z.string().trim().min(1).max(240).default("Main clinic"),
        timezone: z.string().trim().min(1).max(80).default("Europe/Helsinki"),
        appointmentDurationMinutes: z.number().int().min(15).max(180).multipleOf(15).default(30),
        bufferMinutes: z.number().int().min(0).max(180).default(0),
        bookingWindowDays: z.number().int().min(1).max(bookingHorizonDays).default(90),
        minimumNoticeMinutes: z
          .number()
          .int()
          .min(0)
          .max(bookingHorizonDays * 24 * 60)
          .default(0),
        serviceIds: z.array(z.string()).default([]),
      })
      .optional(),
  });

  const userUpdateSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    active: z.boolean().optional(),
    preferredLocale: localeSchema.optional(),
  });

  const serviceSchema = z.object({
    nameEn: z.string().trim().min(1).max(120),
    nameFi: z.string().trim().min(1).max(120),
    descriptionEn: z.string().trim().max(500).nullable().optional(),
    descriptionFi: z.string().trim().max(500).nullable().optional(),
    active: z.boolean().default(true),
  });

  app.get("/admin/users", async (request) => {
    await requireRole(request, [Role.ADMIN]);
    const users = await prisma.user.findMany({
      include: {
        patientProfile: true,
        workerProfile: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { users: users.map(serializeUser) };
  });

  app.post("/admin/users", async (request) => {
    const actor = await requireRole(request, [Role.ADMIN]);
    const data = userCreateSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "Email is already registered");
    }

    const createData: Prisma.UserCreateInput = {
      email: data.email,
      passwordHash: await hashPassword(data.password),
      name: data.name,
      role: data.role,
      preferredLocale: localeToPrisma(data.preferredLocale ?? "en"),
    };
    if (data.phone !== undefined) createData.phone = data.phone;
    if (data.role === "PATIENT") createData.patientProfile = { create: {} };
    if (data.role === "WORKER") {
      createData.workerProfile = {
        create: {
          title: data.worker?.title ?? "Healthcare worker",
          location: data.worker?.location ?? "Main clinic",
          timezone: data.worker?.timezone ?? "Europe/Helsinki",
          appointmentDurationMinutes: data.worker?.appointmentDurationMinutes ?? 30,
          bufferMinutes: data.worker?.bufferMinutes ?? 0,
          bookingWindowDays: data.worker?.bookingWindowDays ?? 90,
          minimumNoticeMinutes: data.worker?.minimumNoticeMinutes ?? 0,
          services: {
            create: (data.worker?.serviceIds ?? []).map((serviceId) => ({
              service: { connect: { id: serviceId } },
            })),
          },
        },
      };
    }

    const user = await prisma.user.create({
      data: createData,
      include: {
        patientProfile: true,
        workerProfile: true,
      },
    });

    await auditLog({
      actorId: actor.id,
      action: "admin.createUser",
      entityType: "user",
      entityId: user.id,
      metadata: { role: data.role },
    });

    return { user: serializeUser(user) };
  });

  app.patch("/admin/users/:id", async (request) => {
    const actor = await requireRole(request, [Role.ADMIN]);
    const params = idParamsSchema.parse(request.params);
    const data = userUpdateSchema.parse(request.body);
    const updateData: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.preferredLocale !== undefined) {
      updateData.preferredLocale = localeToPrisma(data.preferredLocale);
    }
    const user = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      include: {
        patientProfile: true,
        workerProfile: true,
      },
    });

    await auditLog({
      actorId: actor.id,
      action: "admin.updateUser",
      entityType: "user",
      entityId: user.id,
    });

    return { user: serializeUser(user) };
  });

  app.get("/admin/services", async (request) => {
    await requireRole(request, [Role.ADMIN]);
    const services = await prisma.service.findMany({ orderBy: { nameEn: "asc" } });
    return { services: services.map(serializeService) };
  });

  app.post("/admin/services", async (request) => {
    const actor = await requireRole(request, [Role.ADMIN]);
    const data = serviceSchema.parse(request.body);
    const service = await prisma.service.create({
      data: definedEntries(data) as Prisma.ServiceCreateInput,
    });
    await auditLog({
      actorId: actor.id,
      action: "admin.createService",
      entityType: "service",
      entityId: service.id,
    });
    return { service: serializeService(service) };
  });

  app.patch("/admin/services/:id", async (request) => {
    const actor = await requireRole(request, [Role.ADMIN]);
    const params = idParamsSchema.parse(request.params);
    const data = serviceSchema.partial().parse(request.body);
    const service = await prisma.service.update({
      where: { id: params.id },
      data: definedEntries(data) as Prisma.ServiceUpdateInput,
    });
    await auditLog({
      actorId: actor.id,
      action: "admin.updateService",
      entityType: "service",
      entityId: service.id,
    });
    return { service: serializeService(service) };
  });

  app.get("/admin/appointments", async (request) => {
    await requireRole(request, [Role.ADMIN]);
    const appointments = await prisma.appointment.findMany({
      include: appointmentInclude,
      orderBy: { startsAt: "desc" },
      take: 200,
    });
    return { appointments: appointments.map(serializeAppointment) };
  });

  app.get("/admin/audit-logs", async (request) => {
    await requireRole(request, [Role.ADMIN]);
    const logs = await prisma.auditLog.findMany({
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { auditLogs: logs };
  });
}
