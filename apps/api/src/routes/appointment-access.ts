import type { FastifyRequest } from "fastify";
import { requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { ApiError } from "../errors.js";
import { Role } from "../generated/prisma/client.js";
import { appointmentInclude } from "./serializers.js";

export async function canAccessAppointment(request: FastifyRequest, appointmentId: string) {
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
