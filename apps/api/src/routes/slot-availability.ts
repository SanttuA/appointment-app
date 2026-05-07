import { prisma } from "../db.js";
import { ApiError } from "../errors.js";
import { AppointmentStatus, type Prisma } from "../generated/prisma/client.js";
import {
  assertSlotIncrement,
  bookingHorizonDays,
  bufferedConflictLookupRange,
  generateSlots,
  overlaps,
} from "../scheduling.js";

function assertBookingWindow(
  startsAt: Date,
  settings: { bookingWindowDays?: number; minimumNoticeMinutes?: number } = {},
) {
  const now = new Date();
  const cappedHorizonDays = Math.min(
    settings.bookingWindowDays ?? bookingHorizonDays,
    bookingHorizonDays,
  );
  const earliest = new Date(now.getTime() + (settings.minimumNoticeMinutes ?? 0) * 60_000);
  const horizon = new Date(now.getTime() + cappedHorizonDays * 24 * 60 * 60 * 1000);
  if (startsAt < earliest || startsAt > horizon) {
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

export async function assertAvailableSlot(input: {
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
  assertBookingWindow(input.startsAt, {
    bookingWindowDays: worker.bookingWindowDays,
    minimumNoticeMinutes: worker.minimumNoticeMinutes,
  });

  const service = worker.services.find(
    (entry) => entry.serviceId === input.serviceId && entry.service.active,
  );
  if (!service) {
    throw new ApiError(400, "SERVICE_NOT_AVAILABLE", "Service is not available for this worker");
  }

  const endsAt = new Date(input.startsAt.getTime() + worker.appointmentDurationMinutes * 60_000);
  const conflictLookupRange = bufferedConflictLookupRange(
    { startsAt: input.startsAt, endsAt },
    worker.bufferMinutes,
  );
  const bookedWhere: Prisma.AppointmentWhereInput = {
    workerProfileId: input.workerProfileId,
    status: AppointmentStatus.CONFIRMED,
    startsAt: { lt: conflictLookupRange.endsAt },
    endsAt: { gt: conflictLookupRange.startsAt },
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
    bufferMinutes: worker.bufferMinutes,
    availability: worker.availability.map((window) => ({
      ...window,
      location: window.location ?? worker.location,
    })),
    timeOff: worker.timeOff,
    booked,
  });

  const availableSlot = slots.find(
    (slot) =>
      slot.startsAt.getTime() === input.startsAt.getTime() &&
      slot.endsAt.getTime() === endsAt.getTime(),
  );

  if (
    !availableSlot ||
    booked.some((appointment) => overlaps({ startsAt: input.startsAt, endsAt }, appointment))
  ) {
    throw new ApiError(409, "SLOT_UNAVAILABLE", "Selected slot is not available");
  }

  return {
    worker,
    service: service.service,
    endsAt,
    location: availableSlot.location ?? worker.location,
  };
}
