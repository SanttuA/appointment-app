import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditLog } from "../audit.js";
import { requireRole } from "../auth.js";
import { prisma } from "../db.js";
import { ApiError } from "../errors.js";
import { Role, type Prisma } from "../generated/prisma/client.js";
import { bookingHorizonDays } from "../scheduling.js";
import { parseDate } from "./helpers.js";
import { idParamsSchema } from "./schemas.js";
import { serializeWorker } from "./serializers.js";

export function registerWorkerRoutes(app: FastifyInstance) {
  const profileSchema = z.object({
    title: z.string().trim().min(1).max(120).optional(),
    bio: z.string().trim().max(1200).nullable().optional(),
    location: z.string().trim().min(1).max(240).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
    appointmentDurationMinutes: z.number().int().min(15).max(180).multipleOf(15).optional(),
    bufferMinutes: z.number().int().min(0).max(180).optional(),
    bookingWindowDays: z.number().int().min(1).max(bookingHorizonDays).optional(),
    minimumNoticeMinutes: z
      .number()
      .int()
      .min(0)
      .max(bookingHorizonDays * 24 * 60)
      .optional(),
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
          location: z.string().trim().min(1).max(240).nullable().optional(),
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
    if (data.bufferMinutes !== undefined) updateData.bufferMinutes = data.bufferMinutes;
    if (data.bookingWindowDays !== undefined) updateData.bookingWindowDays = data.bookingWindowDays;
    if (data.minimumNoticeMinutes !== undefined) {
      updateData.minimumNoticeMinutes = data.minimumNoticeMinutes;
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

  app.get("/worker/settings", async (request) => {
    const user = await requireRole(request, [Role.WORKER]);
    if (!user.workerProfile) {
      throw new ApiError(404, "WORKER_PROFILE_MISSING", "Worker profile is missing");
    }
    const [worker, windows, timeOff] = await Promise.all([
      prisma.workerProfile.findUniqueOrThrow({
        where: { id: user.workerProfile.id },
        include: {
          user: true,
          services: {
            include: {
              service: true,
            },
          },
        },
      }),
      prisma.availabilityWindow.findMany({
        where: { workerProfileId: user.workerProfile.id },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      }),
      prisma.timeOff.findMany({
        where: { workerProfileId: user.workerProfile.id },
        orderBy: { startsAt: "asc" },
      }),
    ]);
    return { worker: serializeWorker(worker), windows, timeOff };
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
            location: window.location ?? null,
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
          location: window.location ?? null,
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
