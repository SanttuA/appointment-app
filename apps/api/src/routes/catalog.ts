import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError } from "../errors.js";
import { AppointmentStatus } from "../generated/prisma/client.js";
import {
  bookingHorizonDays,
  bufferedConflictLookupRange,
  generateScheduleSlots,
  generateSlots,
} from "../scheduling.js";
import { parseDate } from "./helpers.js";
import { idParamsSchema } from "./schemas.js";
import { serializeService, serializeWorker } from "./serializers.js";

export function registerCatalogRoutes(app: FastifyInstance) {
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

    const conflictLookupRange = bufferedConflictLookupRange(
      { startsAt: from, endsAt: to },
      worker.bufferMinutes,
    );
    const booked = await prisma.appointment.findMany({
      where: {
        workerProfileId: worker.id,
        status: AppointmentStatus.CONFIRMED,
        startsAt: { lt: conflictLookupRange.endsAt },
        endsAt: { gt: conflictLookupRange.startsAt },
      },
    });

    const now = new Date();
    const earliest = new Date(now.getTime() + worker.minimumNoticeMinutes * 60_000);
    const horizon = new Date(
      now.getTime() + Math.min(worker.bookingWindowDays, bookingHorizonDays) * 24 * 60 * 60 * 1000,
    );
    const effectiveFrom = from > earliest ? from : earliest;
    const effectiveTo = to < horizon ? to : horizon;
    if (effectiveTo <= effectiveFrom) {
      return { slots: [] };
    }

    const slotInput = {
      from: effectiveFrom,
      to: effectiveTo,
      timeZone: worker.timezone,
      durationMinutes: worker.appointmentDurationMinutes,
      bufferMinutes: worker.bufferMinutes,
      availability: worker.availability.map((window) => ({
        ...window,
        location: window.location ?? worker.location,
      })),
      timeOff: worker.timeOff,
      booked,
    };

    const slots =
      query.includeTaken === "true" ? generateScheduleSlots(slotInput) : generateSlots(slotInput);

    return {
      slots: slots.map((slot) => ({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        location: slot.location ?? worker.location,
        ...("status" in slot ? { status: slot.status } : {}),
      })),
    };
  });
}
