import "dotenv/config";
import { hashPassword } from "../src/auth.js";
import { prisma } from "../src/db.js";
import { AppointmentStatus, Locale, Role } from "../src/generated/prisma/client.js";
import { zonedTimeToUtc } from "../src/scheduling.js";

const password = "E2ePassword123!";
const timeZone = "Europe/Helsinki";
const serviceId = "e2e-service-general-practice";
const projectNames = ["chromium", "mobile-chrome"];

function labelFromProjectName(projectName: string) {
  return projectName
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function partsInTimeZone(date: Date, targetTimeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: targetTimeZone,
    year: "numeric",
  });
  const entries = formatter
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]);
  return Object.fromEntries(entries) as {
    day: number;
    hour: number;
    minute: number;
    month: number;
    year: number;
  };
}

function todayAtMinute(minuteOfDay: number) {
  const today = partsInTimeZone(new Date(), timeZone);
  return zonedTimeToUtc({ ...today, minuteOfDay, timeZone });
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

async function upsertPatient(input: { email: string; name: string; passwordHash: string }) {
  const patient = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      active: true,
      name: input.name,
      passwordHash: input.passwordHash,
      preferredLocale: Locale.EN,
      role: Role.PATIENT,
    },
    create: {
      active: true,
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      preferredLocale: Locale.EN,
      role: Role.PATIENT,
      patientProfile: { create: {} },
    },
    include: { patientProfile: true },
  });
  if (!patient.patientProfile) {
    await prisma.patientProfile.create({ data: { userId: patient.id } });
  }
  return patient;
}

async function main() {
  const passwordHash = await hashPassword(password);
  const service = await prisma.service.upsert({
    where: { id: serviceId },
    update: {
      active: true,
      nameEn: "E2E General practice",
      nameFi: "E2E Yleislääkäri",
    },
    create: {
      id: serviceId,
      active: true,
      descriptionEn: "E2E appointment test service.",
      descriptionFi: "E2E ajanvarauksen testipalvelu.",
      nameEn: "E2E General practice",
      nameFi: "E2E Yleislääkäri",
    },
  });

  await upsertPatient({
    email: "e2e.patient@example.com",
    name: "E2E Booking Patient",
    passwordHash,
  });

  for (const projectName of projectNames) {
    const label = labelFromProjectName(projectName);
    const agendaPatient = await upsertPatient({
      email: `e2e.agenda.${projectName}@example.com`,
      name: "E2E Patient",
      passwordHash,
    });
    const workerUser = await prisma.user.upsert({
      where: { email: `e2e.worker.${projectName}@example.com` },
      update: {
        active: true,
        name: `Dr. E2E ${label}`,
        passwordHash,
        preferredLocale: Locale.EN,
        role: Role.WORKER,
      },
      create: {
        active: true,
        email: `e2e.worker.${projectName}@example.com`,
        name: `Dr. E2E ${label}`,
        passwordHash,
        preferredLocale: Locale.EN,
        role: Role.WORKER,
      },
    });

    const worker = await prisma.workerProfile.upsert({
      where: { userId: workerUser.id },
      update: {
        active: true,
        appointmentDurationMinutes: 30,
        bookingWindowDays: 14,
        bufferMinutes: 0,
        location: `E2E Clinic ${label}`,
        minimumNoticeMinutes: 0,
        timezone: timeZone,
        title: "General practitioner",
      },
      create: {
        active: true,
        appointmentDurationMinutes: 30,
        bookingWindowDays: 14,
        bufferMinutes: 0,
        location: `E2E Clinic ${label}`,
        minimumNoticeMinutes: 0,
        timezone: timeZone,
        title: "General practitioner",
        userId: workerUser.id,
      },
    });

    await prisma.workerService.upsert({
      where: {
        workerProfileId_serviceId: {
          serviceId: service.id,
          workerProfileId: worker.id,
        },
      },
      update: {},
      create: {
        serviceId: service.id,
        workerProfileId: worker.id,
      },
    });

    await prisma.availabilityWindow.deleteMany({ where: { workerProfileId: worker.id } });
    await prisma.availabilityWindow.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        active: true,
        endMinute: 18 * 60,
        location: `E2E Clinic ${label}`,
        startMinute: 8 * 60,
        weekday,
        workerProfileId: worker.id,
      })),
    });

    await prisma.timeOff.deleteMany({ where: { workerProfileId: worker.id } });

    const now = partsInTimeZone(new Date(), timeZone);
    const currentStartMinute = Math.max(0, now.hour * 60 + now.minute - 15);
    const currentEndMinute = Math.min(24 * 60, now.hour * 60 + now.minute + 30);
    const cancelStartMinute = Math.min(24 * 60 - 30, now.hour * 60 + now.minute + 45);
    const currentStartsAt = todayAtMinute(currentStartMinute);
    const cancelStartsAt = todayAtMinute(cancelStartMinute);

    await prisma.appointment.upsert({
      where: { id: `e2e-${projectName}-current` },
      update: {
        cancellationReason: null,
        canceledAt: null,
        endsAt: todayAtMinute(currentEndMinute),
        location: `E2E Clinic ${label}`,
        patientId: agendaPatient.id,
        serviceId: service.id,
        startsAt: currentStartsAt,
        status: AppointmentStatus.CONFIRMED,
        updatedById: workerUser.id,
        workerProfileId: worker.id,
      },
      create: {
        id: `e2e-${projectName}-current`,
        createdById: agendaPatient.id,
        endsAt: todayAtMinute(currentEndMinute),
        location: `E2E Clinic ${label}`,
        patientId: agendaPatient.id,
        serviceId: service.id,
        startsAt: currentStartsAt,
        status: AppointmentStatus.CONFIRMED,
        workerProfileId: worker.id,
      },
    });

    await prisma.appointment.upsert({
      where: { id: `e2e-${projectName}-cancel` },
      update: {
        cancellationReason: null,
        canceledAt: null,
        endsAt: addMinutes(cancelStartsAt, 30),
        location: `E2E Clinic ${label}`,
        patientId: agendaPatient.id,
        serviceId: service.id,
        startsAt: cancelStartsAt,
        status: AppointmentStatus.CONFIRMED,
        updatedById: workerUser.id,
        workerProfileId: worker.id,
      },
      create: {
        id: `e2e-${projectName}-cancel`,
        createdById: agendaPatient.id,
        endsAt: addMinutes(cancelStartsAt, 30),
        location: `E2E Clinic ${label}`,
        patientId: agendaPatient.id,
        serviceId: service.id,
        startsAt: cancelStartsAt,
        status: AppointmentStatus.CONFIRMED,
        workerProfileId: worker.id,
      },
    });
  }

  console.log("Seeded E2E data.");
  console.log("E2E password:", password);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
