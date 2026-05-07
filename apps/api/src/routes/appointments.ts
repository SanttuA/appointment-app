import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditLog } from "../audit.js";
import { requireAuth, requireRole } from "../auth.js";
import { prisma } from "../db.js";
import { ApiError } from "../errors.js";
import { AppointmentStatus, Role, type Prisma } from "../generated/prisma/client.js";
import { appointmentHasStarted, patientCancellationCutoffHours } from "../scheduling.js";
import { canAccessAppointment } from "./appointment-access.js";
import { parseDate } from "./helpers.js";
import { idParamsSchema } from "./schemas.js";
import { serializeAppointment, appointmentInclude } from "./serializers.js";
import { assertAvailableSlot } from "./slot-availability.js";

export function registerAppointmentRoutes(app: FastifyInstance) {
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

  const statusUpdateSchema = z.object({
    status: z.enum(["COMPLETED", "NO_SHOW"]),
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
        location: availability.location,
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
        location: availability.location,
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

  app.patch("/appointments/:id/status", async (request) => {
    const params = idParamsSchema.parse(request.params);
    const data = statusUpdateSchema.parse(request.body);
    const { appointment, user } = await canAccessAppointment(request, params.id);

    if (user.role !== Role.WORKER && user.role !== Role.ADMIN) {
      throw new ApiError(403, "FORBIDDEN", "You do not have permission for this action");
    }
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new ApiError(400, "APPOINTMENT_NOT_ACTIVE", "Only active appointments can be updated");
    }
    if (!appointmentHasStarted(appointment)) {
      throw new ApiError(
        400,
        "APPOINTMENT_NOT_STARTED",
        "Appointment status can only be updated after the start time",
      );
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status:
          data.status === "COMPLETED" ? AppointmentStatus.COMPLETED : AppointmentStatus.NO_SHOW,
        updatedById: user.id,
      },
      include: appointmentInclude,
    });

    await auditLog({
      actorId: user.id,
      action: "appointment.updateStatus",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: { status: data.status },
    });

    return { appointment: serializeAppointment(updated) };
  });
}
