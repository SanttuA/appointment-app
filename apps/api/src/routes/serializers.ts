import { type Prisma } from "../generated/prisma/client.js";
import { prismaLocaleToUi } from "./helpers.js";

export const appointmentInclude = {
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

export function serializeService(service: {
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

export function serializeWorker(
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
    bufferMinutes: worker.bufferMinutes,
    bookingWindowDays: worker.bookingWindowDays,
    minimumNoticeMinutes: worker.minimumNoticeMinutes,
    active: worker.active && worker.user.active,
    services: worker.services.map((entry) => serializeService(entry.service)),
  };
}

export function serializeAppointment(
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
    location: appointment.location ?? appointment.workerProfile.location,
    status: appointment.status,
    cancellationReason: appointment.cancellationReason,
    canceledAt: appointment.canceledAt,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}
