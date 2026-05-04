import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { auditLog } from "./audit.js";
import {
  clearSession,
  createSession,
  getSessionUser,
  hashPassword,
  requireAuth,
  requireRole,
  serializeUser,
  verifyPassword,
} from "./auth.js";
import { prisma } from "./db.js";
import { ApiError } from "./errors.js";
import { AppointmentStatus, Locale, Role, type Prisma } from "./generated/prisma/client.js";
import {
  assertSlotIncrement,
  bookingHorizonDays,
  generateScheduleSlots,
  generateSlots,
  overlaps,
  patientCancellationCutoffHours,
} from "./scheduling.js";

const passwordSchema = z.string().min(10).max(200);
const localeSchema = z.enum(["en", "fi"]).default("en");
const emailSchema = z.string().trim().email().toLowerCase();
const idParamsSchema = z.object({ id: z.string().min(1) });

const appointmentInclude = {
  patient: {
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      preferredLocale: true,
    },
  },
  workerProfile: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
  service: true,
} satisfies Prisma.AppointmentInclude;

function localeToPrisma(locale: "en" | "fi") {
  return locale === "fi" ? Locale.FI : Locale.EN;
}

function prismaLocaleToUi(locale: Locale) {
  return locale.toLowerCase();
}

function serializeService(service: {
  id: string;
  nameEn: string;
  nameFi: string;
  descriptionEn: string | null;
  descriptionFi: string | null;
  active: boolean;
}) {
  return {
    id: service.id,
    name: {
      en: service.nameEn,
      fi: service.nameFi,
    },
    description: {
      en: service.descriptionEn,
      fi: service.descriptionFi,
    },
    active: service.active,
  };
}

function serializeWorker(
  worker: Prisma.WorkerProfileGetPayload<{
    include: { user: true; services: { include: { service: true } } };
  }>,
) {
  return {
    id: worker.id,
    userId: worker.userId,
    name: worker.user.name,
    email: worker.user.email,
    title: worker.title,
    bio: worker.bio,
    location: worker.location,
    timezone: worker.timezone,
    appointmentDurationMinutes: worker.appointmentDurationMinutes,
    active: worker.active && worker.user.active,
    services: worker.services.map((entry) => serializeService(entry.service)),
  };
}

function serializeAppointment(
  appointment: Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>,
) {
  return {
    id: appointment.id,
    patient: {
      id: appointment.patient.id,
      name: appointment.patient.name,
      email: appointment.patient.email,
      phone: appointment.patient.phone,
      preferredLocale: prismaLocaleToUi(appointment.patient.preferredLocale),
    },
    worker: {
      id: appointment.workerProfile.id,
      name: appointment.workerProfile.user.name,
      email: appointment.workerProfile.user.email,
      title: appointment.workerProfile.title,
      location: appointment.workerProfile.location,
      timezone: appointment.workerProfile.timezone,
    },
    service: serializeService(appointment.service),
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    status: appointment.status,
    cancellationReason: appointment.cancellationReason,
    canceledAt: appointment.canceledAt,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}

function parseDate(value: string, code: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, code, "Invalid date");
  }
  return date;
}

function definedEntries<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Record<string, unknown>;
}

function assertBookingWindow(startsAt: Date) {
  const now = new Date();
  const horizon = new Date(now.getTime() + bookingHorizonDays * 24 * 60 * 60 * 1000);
  if (startsAt < now || startsAt > horizon) {
    throw new ApiError(400, "BOOKING_WINDOW_INVALID", "Appointment is outside the booking window");
  }
  if (!assertSlotIncrement(startsAt)) {
    throw new ApiError(
      400,
      "SLOT_INCREMENT_INVALID",
      "Appointments must start on 15 minute increments",
    );
  }
}

async function assertAvailableSlot(input: {
  workerProfileId: string;
  serviceId: string;
  startsAt: Date;
  excludeAppointmentId?: string;
}) {
  const worker = await prisma.workerProfile.findUnique({
    where: { id: input.workerProfileId },
    include: {
      user: true,
      availability: true,
      timeOff: true,
      services: {
        include: {
          service: true,
        },
      },
    },
  });

  if (!worker || !worker.active || !worker.user.active) {
    throw new ApiError(404, "WORKER_NOT_FOUND", "Healthcare worker not found");
  }

  const service = worker.services.find(
    (entry) => entry.serviceId === input.serviceId && entry.service.active,
  );
  if (!service) {
    throw new ApiError(400, "SERVICE_NOT_AVAILABLE", "Service is not available for this worker");
  }

  const endsAt = new Date(input.startsAt.getTime() + worker.appointmentDurationMinutes * 60_000);
  const bookedWhere: Prisma.AppointmentWhereInput = {
    workerProfileId: input.workerProfileId,
    status: AppointmentStatus.CONFIRMED,
    startsAt: { lt: endsAt },
    endsAt: { gt: input.startsAt },
  };
  if (input.excludeAppointmentId) {
    bookedWhere.id = { not: input.excludeAppointmentId };
  }
  const booked = await prisma.appointment.findMany({ where: bookedWhere });

  const slots = generateSlots({
    from: input.startsAt,
    to: endsAt,
    timeZone: worker.timezone,
    durationMinutes: worker.appointmentDurationMinutes,
    availability: worker.availability,
    timeOff: worker.timeOff,
    booked,
  });

  const isAvailable = slots.some(
    (slot) =>
      slot.startsAt.getTime() === input.startsAt.getTime() &&
      slot.endsAt.getTime() === endsAt.getTime(),
  );

  if (
    !isAvailable ||
    booked.some((appointment) => overlaps({ startsAt: input.startsAt, endsAt }, appointment))
  ) {
    throw new ApiError(409, "SLOT_UNAVAILABLE", "Selected slot is not available");
  }

  return { worker, service: service.service, endsAt };
}

async function canAccessAppointment(request: FastifyRequest, appointmentId: string) {
  const user = await requireAuth(request);
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });

  if (!appointment) {
    throw new ApiError(404, "APPOINTMENT_NOT_FOUND", "Appointment not found");
  }

  const isOwner = appointment.patientId === user.id;
  const isWorker = user.workerProfile?.id === appointment.workerProfileId;
  if (user.role !== Role.ADMIN && !isOwner && !isWorker) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission for this appointment");
  }

  return { appointment, user };
}

function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok" }));
}

function registerAuthRoutes(app: FastifyInstance) {
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

function registerCatalogRoutes(app: FastifyInstance) {
  app.get("/services", async () => {
    const services = await prisma.service.findMany({
      where: { active: true },
      orderBy: { nameEn: "asc" },
    });
    return { services: services.map(serializeService) };
  });

  app.get("/workers", async () => {
    const workers = await prisma.workerProfile.findMany({
      where: {
        active: true,
        user: { active: true },
      },
      include: {
        user: true,
        services: {
          include: {
            service: true,
          },
        },
      },
      orderBy: {
        user: {
          name: "asc",
        },
      },
    });

    return { workers: workers.map(serializeWorker) };
  });

  app.get("/workers/:id/slots", async (request) => {
    const params = idParamsSchema.parse(request.params);
    const query = z
      .object({
        serviceId: z.string().min(1),
        from: z.string().datetime(),
        to: z.string().datetime(),
        includeTaken: z.enum(["true", "false"]).optional(),
      })
      .parse(request.query);
    const from = parseDate(query.from, "FROM_DATE_INVALID");
    const to = parseDate(query.to, "TO_DATE_INVALID");
    if (to <= from) {
      throw new ApiError(400, "DATE_RANGE_INVALID", "End date must be after start date");
    }

    const worker = await prisma.workerProfile.findUnique({
      where: { id: params.id },
      include: {
        user: true,
        availability: true,
        timeOff: true,
        services: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!worker || !worker.active || !worker.user.active) {
      throw new ApiError(404, "WORKER_NOT_FOUND", "Healthcare worker not found");
    }

    const offersService = worker.services.some(
      (entry) => entry.serviceId === query.serviceId && entry.service.active,
    );
    if (!offersService) {
      throw new ApiError(400, "SERVICE_NOT_AVAILABLE", "Service is not available for this worker");
    }

    const booked = await prisma.appointment.findMany({
      where: {
        workerProfileId: worker.id,
        status: AppointmentStatus.CONFIRMED,
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
    });

    const slotInput = {
      from,
      to,
      timeZone: worker.timezone,
      durationMinutes: worker.appointmentDurationMinutes,
      availability: worker.availability,
      timeOff: worker.timeOff,
      booked,
    };

    const slots =
      query.includeTaken === "true" ? generateScheduleSlots(slotInput) : generateSlots(slotInput);

    return {
      slots: slots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        ...("status" in slot ? { status: slot.status } : {}),
      })),
    };
  });
}

function registerAppointmentRoutes(app: FastifyInstance) {
  const createSchema = z.object({
    workerProfileId: z.string().min(1),
    serviceId: z.string().min(1),
    startsAt: z.string().datetime(),
  });

  const rescheduleSchema = z.object({
    startsAt: z.string().datetime(),
  });

  const cancelSchema = z.object({
    reason: z.string().trim().max(240).optional(),
  });

  app.get("/appointments", async (request) => {
    const user = await requireAuth(request);
    const where: Prisma.AppointmentWhereInput = {};
    if (user.role === Role.PATIENT) {
      where.patientId = user.id;
    } else if (user.role === Role.WORKER) {
      where.workerProfileId = user.workerProfile?.id ?? "__missing__";
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: { startsAt: "asc" },
    });

    return { appointments: appointments.map(serializeAppointment) };
  });

  app.post("/appointments", async (request) => {
    const user = await requireRole(request, [Role.PATIENT, Role.ADMIN]);
    const data = createSchema.parse(request.body);
    const startsAt = parseDate(data.startsAt, "START_DATE_INVALID");
    assertBookingWindow(startsAt);
    const patientId = user.role === Role.PATIENT ? user.id : user.id;
    const availability = await assertAvailableSlot({
      workerProfileId: data.workerProfileId,
      serviceId: data.serviceId,
      startsAt,
    });

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        workerProfileId: data.workerProfileId,
        serviceId: data.serviceId,
        startsAt,
        endsAt: availability.endsAt,
        createdById: user.id,
      },
      include: appointmentInclude,
    });

    await auditLog({
      actorId: user.id,
      action: "appointment.create",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: { workerProfileId: data.workerProfileId, serviceId: data.serviceId },
    });

    return { appointment: serializeAppointment(appointment) };
  });

  app.patch("/appointments/:id/reschedule", async (request) => {
    const params = idParamsSchema.parse(request.params);
    const data = rescheduleSchema.parse(request.body);
    const { appointment, user } = await canAccessAppointment(request, params.id);

    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ApiError(400, "APPOINTMENT_NOT_ACTIVE", "Only active appointments can be changed");
    }

    if (
      user.role === Role.PATIENT &&
      appointment.startsAt.getTime() - Date.now() < patientCancellationCutoffHours * 60 * 60 * 1000
    ) {
      throw new ApiError(400, "CHANGE_WINDOW_CLOSED", "Appointment can no longer be changed");
    }

    const startsAt = parseDate(data.startsAt, "START_DATE_INVALID");
    assertBookingWindow(startsAt);
    const availability = await assertAvailableSlot({
      workerProfileId: appointment.workerProfileId,
      serviceId: appointment.serviceId,
      startsAt,
      excludeAppointmentId: appointment.id,
    });

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        startsAt,
        endsAt: availability.endsAt,
        updatedById: user.id,
      },
      include: appointmentInclude,
    });

    await auditLog({
      actorId: user.id,
      action: "appointment.reschedule",
      entityType: "appointment",
      entityId: appointment.id,
    });

    return { appointment: serializeAppointment(updated) };
  });

  app.post("/appointments/:id/cancel", async (request) => {
    const params = idParamsSchema.parse(request.params);
    const data = cancelSchema.parse(request.body);
    const { appointment, user } = await canAccessAppointment(request, params.id);

    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ApiError(400, "APPOINTMENT_NOT_ACTIVE", "Only active appointments can be canceled");
    }

    if (
      user.role === Role.PATIENT &&
      appointment.startsAt.getTime() - Date.now() < patientCancellationCutoffHours * 60 * 60 * 1000
    ) {
      throw new ApiError(
        400,
        "CANCELLATION_WINDOW_CLOSED",
        "Appointment can no longer be canceled",
      );
    }

    const cancelData: Prisma.AppointmentUncheckedUpdateInput = {
      status: AppointmentStatus.CANCELED,
      canceledAt: new Date(),
      updatedById: user.id,
    };
    if (data.reason !== undefined) cancelData.cancellationReason = data.reason;

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: cancelData,
      include: appointmentInclude,
    });

    await auditLog({
      actorId: user.id,
      action: "appointment.cancel",
      entityType: "appointment",
      entityId: appointment.id,
    });

    return { appointment: serializeAppointment(updated) };
  });
}

function registerWorkerRoutes(app: FastifyInstance) {
  const profileSchema = z.object({
    title: z.string().trim().min(1).max(120).optional(),
    bio: z.string().trim().max(1200).nullable().optional(),
    location: z.string().trim().min(1).max(240).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    appointmentDurationMinutes: z.number().int().min(15).max(180).multipleOf(15).optional(),
  });

  const availabilitySchema = z.object({
    windows: z.array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startMinute: z
            .number()
            .int()
            .min(0)
            .max(24 * 60 - 15)
            .multipleOf(15),
          endMinute: z
            .number()
            .int()
            .min(15)
            .max(24 * 60)
            .multipleOf(15),
          active: z.boolean().default(true),
        })
        .refine((window) => window.endMinute > window.startMinute, {
          message: "endMinute must be greater than startMinute",
        }),
    ),
  });

  const workerSettingsSchema = profileSchema.extend({
    windows: availabilitySchema.shape.windows,
  });

  const timeOffSchema = z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().max(240).optional(),
  });

  function workerProfileUpdateData(data: z.infer<typeof profileSchema>) {
    const updateData: Prisma.WorkerProfileUpdateInput = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.location !== undefined) updateData.location = data.location;
    if (data.timezone !== undefined) updateData.timezone = data.timezone;
    if (data.appointmentDurationMinutes !== undefined) {
      updateData.appointmentDurationMinutes = data.appointmentDurationMinutes;
    }
    return updateData;
  }

  app.get("/worker/profile", async (request) => {
    const user = await requireRole(request, [Role.WORKER]);
    if (!user.workerProfile) {
      throw new ApiError(404, "WORKER_PROFILE_MISSING", "Worker profile is missing");
    }
    const worker = await prisma.workerProfile.findUniqueOrThrow({
      where: { id: user.workerProfile.id },
      include: {
        user: true,
        services: {
          include: {
            service: true,
          },
        },
      },
    });
    return { worker: serializeWorker(worker) };
  });

  app.put("/worker/settings", async (request) => {
    const user = await requireRole(request, [Role.WORKER]);
    if (!user.workerProfile) {
      throw new ApiError(404, "WORKER_PROFILE_MISSING", "Worker profile is missing");
    }
    const data = workerSettingsSchema.parse(request.body);
    const updateData = workerProfileUpdateData(data);

    const result = await prisma.$transaction(async (tx) => {
      const worker = await tx.workerProfile.update({
        where: { id: user.workerProfile!.id },
        data: updateData,
        include: {
          user: true,
          services: {
            include: {
              service: true,
            },
          },
        },
      });
      await tx.availabilityWindow.deleteMany({
        where: { workerProfileId: user.workerProfile!.id },
      });
      if (data.windows.length) {
        await tx.availabilityWindow.createMany({
          data: data.windows.map((window) => ({
            ...window,
            workerProfileId: user.workerProfile!.id,
          })),
        });
      }
      const windows = await tx.availabilityWindow.findMany({
        where: { workerProfileId: user.workerProfile!.id },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "worker.updateSettings",
          entityType: "workerProfile",
          entityId: user.workerProfile!.id,
          metadata: JSON.stringify({ availabilityCount: windows.length }),
        },
      });
      return { windows, worker };
    });

    return { worker: serializeWorker(result.worker), windows: result.windows };
  });

  app.patch("/worker/profile", async (request) => {
    const user = await requireRole(request, [Role.WORKER]);
    if (!user.workerProfile) {
      throw new ApiError(404, "WORKER_PROFILE_MISSING", "Worker profile is missing");
    }
    const data = profileSchema.parse(request.body);
    const updateData = workerProfileUpdateData(data);
    const worker = await prisma.workerProfile.update({
      where: { id: user.workerProfile.id },
      data: updateData,
      include: {
        user: true,
        services: {
          include: {
            service: true,
          },
        },
      },
    });

    await auditLog({
      actorId: user.id,
      action: "worker.updateProfile",
      entityType: "workerProfile",
      entityId: worker.id,
    });

    return { worker: serializeWorker(worker) };
  });

  app.get("/worker/availability", async (request) => {
    const user = await requireRole(request, [Role.WORKER]);
    const windows = await prisma.availabilityWindow.findMany({
      where: { workerProfileId: user.workerProfile?.id ?? "__missing__" },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
    });
    return { windows };
  });

  app.put("/worker/availability", async (request) => {
    const user = await requireRole(request, [Role.WORKER]);
    if (!user.workerProfile) {
      throw new ApiError(404, "WORKER_PROFILE_MISSING", "Worker profile is missing");
    }
    const data = availabilitySchema.parse(request.body);
    const windows = await prisma.$transaction(async (tx) => {
      await tx.availabilityWindow.deleteMany({
        where: { workerProfileId: user.workerProfile!.id },
      });
      await tx.availabilityWindow.createMany({
        data: data.windows.map((window) => ({
          ...window,
          workerProfileId: user.workerProfile!.id,
        })),
      });
      return tx.availabilityWindow.findMany({
        where: { workerProfileId: user.workerProfile!.id },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      });
    });

    await auditLog({
      actorId: user.id,
      action: "worker.replaceAvailability",
      entityType: "workerProfile",
      entityId: user.workerProfile.id,
      metadata: { count: windows.length },
    });

    return { windows };
  });

  app.get("/worker/time-off", async (request) => {
    const user = await requireRole(request, [Role.WORKER]);
    const entries = await prisma.timeOff.findMany({
      where: { workerProfileId: user.workerProfile?.id ?? "__missing__" },
      orderBy: { startsAt: "asc" },
    });
    return { timeOff: entries };
  });

  app.post("/worker/time-off", async (request) => {
    const user = await requireRole(request, [Role.WORKER]);
    if (!user.workerProfile) {
      throw new ApiError(404, "WORKER_PROFILE_MISSING", "Worker profile is missing");
    }
    const data = timeOffSchema.parse(request.body);
    const startsAt = parseDate(data.startsAt, "START_DATE_INVALID");
    const endsAt = parseDate(data.endsAt, "END_DATE_INVALID");
    if (endsAt <= startsAt) {
      throw new ApiError(400, "DATE_RANGE_INVALID", "End date must be after start date");
    }
    const createData: Prisma.TimeOffUncheckedCreateInput = {
      workerProfileId: user.workerProfile.id,
      startsAt,
      endsAt,
    };
    if (data.reason !== undefined) createData.reason = data.reason;
    const entry = await prisma.timeOff.create({ data: createData });

    await auditLog({
      actorId: user.id,
      action: "worker.createTimeOff",
      entityType: "timeOff",
      entityId: entry.id,
    });

    return { timeOff: entry };
  });

  app.delete("/worker/time-off/:id", async (request) => {
    const user = await requireRole(request, [Role.WORKER]);
    const params = idParamsSchema.parse(request.params);
    const entry = await prisma.timeOff.findUnique({ where: { id: params.id } });
    if (!entry || entry.workerProfileId !== user.workerProfile?.id) {
      throw new ApiError(404, "TIME_OFF_NOT_FOUND", "Time off entry not found");
    }

    await prisma.timeOff.delete({ where: { id: params.id } });
    await auditLog({
      actorId: user.id,
      action: "worker.deleteTimeOff",
      entityType: "timeOff",
      entityId: params.id,
    });

    return { ok: true };
  });
}

function registerAdminRoutes(app: FastifyInstance) {
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

export function registerRoutes(app: FastifyInstance) {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerCatalogRoutes(app);
  registerAppointmentRoutes(app);
  registerWorkerRoutes(app);
  registerAdminRoutes(app);
}
