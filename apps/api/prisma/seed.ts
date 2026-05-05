import "dotenv/config";
import { hashPassword } from "../src/auth.js";
import { prisma } from "../src/db.js";
import { AppointmentStatus, Locale, Role } from "../src/generated/prisma/client.js";
import { zonedTimeToUtc } from "../src/scheduling.js";

const demoPassword = "DemoPassword123!";
const demoTimezone = "Europe/Helsinki";

function partsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  });
  const entries = formatter
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]);
  return Object.fromEntries(entries) as { day: number; month: number; year: number };
}

function demoLocalTime(dayOffset: number, minuteOfDay: number) {
  const today = partsInTimeZone(new Date(), demoTimezone);
  const targetNoon = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset, 12));
  const target = partsInTimeZone(targetNoon, demoTimezone);
  return zonedTimeToUtc({ ...target, minuteOfDay, timeZone: demoTimezone });
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

async function main() {
  const [generalPractice, physiotherapy] = await Promise.all([
    prisma.service.upsert({
      where: { id: "service-general-practice" },
      update: {
        nameEn: "General practice",
        nameFi: "Yleislääkäri",
        active: true,
      },
      create: {
        id: "service-general-practice",
        nameEn: "General practice",
        nameFi: "Yleislääkäri",
        descriptionEn: "General healthcare appointments.",
        descriptionFi: "Yleiset terveydenhuollon ajat.",
      },
    }),
    prisma.service.upsert({
      where: { id: "service-physiotherapy" },
      update: {
        nameEn: "Physiotherapy",
        nameFi: "Fysioterapia",
        active: true,
      },
      create: {
        id: "service-physiotherapy",
        nameEn: "Physiotherapy",
        nameFi: "Fysioterapia",
        descriptionEn: "Movement and rehabilitation support.",
        descriptionFi: "Liikkumisen ja kuntoutuksen tuki.",
      },
    }),
  ]);

  const passwordHash = await hashPassword(demoPassword);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      passwordHash,
      role: Role.ADMIN,
      active: true,
    },
    create: {
      email: "admin@example.com",
      passwordHash,
      name: "Admin User",
      role: Role.ADMIN,
      preferredLocale: Locale.EN,
    },
  });

  const patient = await prisma.user.upsert({
    where: { email: "patient@example.com" },
    update: {
      passwordHash,
      role: Role.PATIENT,
      active: true,
    },
    create: {
      email: "patient@example.com",
      passwordHash,
      name: "Patient User",
      role: Role.PATIENT,
      preferredLocale: Locale.EN,
      patientProfile: {
        create: {},
      },
    },
    include: {
      patientProfile: true,
    },
  });

  if (!patient.patientProfile) {
    await prisma.patientProfile.create({ data: { userId: patient.id } });
  }

  const workerUser = await prisma.user.upsert({
    where: { email: "worker@example.com" },
    update: {
      passwordHash,
      role: Role.WORKER,
      active: true,
    },
    create: {
      email: "worker@example.com",
      passwordHash,
      name: "Dr. Aino Lehto",
      role: Role.WORKER,
      preferredLocale: Locale.FI,
    },
  });

  const worker = await prisma.workerProfile.upsert({
    where: { userId: workerUser.id },
    update: {
      title: "General practitioner",
      location: "Kamppi Health Clinic, Helsinki",
      timezone: demoTimezone,
      appointmentDurationMinutes: 15,
      bufferMinutes: 10,
      bookingWindowDays: 14,
      minimumNoticeMinutes: 120,
      active: true,
    },
    create: {
      userId: workerUser.id,
      title: "General practitioner",
      bio: "Primary care appointments in English and Finnish.",
      location: "Kamppi Health Clinic, Helsinki",
      timezone: demoTimezone,
      appointmentDurationMinutes: 15,
      bufferMinutes: 10,
      bookingWindowDays: 14,
      minimumNoticeMinutes: 120,
    },
  });

  for (const serviceId of [generalPractice.id, physiotherapy.id]) {
    await prisma.workerService.upsert({
      where: {
        workerProfileId_serviceId: {
          workerProfileId: worker.id,
          serviceId,
        },
      },
      update: {},
      create: {
        workerProfileId: worker.id,
        serviceId,
      },
    });
  }

  await prisma.availabilityWindow.deleteMany({ where: { workerProfileId: worker.id } });
  await prisma.availabilityWindow.createMany({
    data: [
      { weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60, location: "Main clinic" },
      { weekday: 1, startMinute: 12 * 60 + 30, endMinute: 16 * 60, location: "Main clinic" },
      { weekday: 2, startMinute: 10 * 60, endMinute: 17 * 60, location: "East clinic" },
      { weekday: 3, startMinute: 9 * 60, endMinute: 13 * 60, location: "Main clinic" },
      { weekday: 4, startMinute: 11 * 60, endMinute: 16 * 60, location: "East clinic" },
    ].map((window) => ({
      ...window,
      workerProfileId: worker.id,
      active: true,
    })),
  });

  const demoPatients = await Promise.all(
    [
      { email: "matti@example.com", name: "Matti Virtanen", phone: "+358 40 123 4567" },
      { email: "sari@example.com", name: "Sari Korhonen", phone: "+358 50 987 6543" },
      { email: "juha@example.com", name: "Juha Mäkinen", phone: "+358 44 555 1234" },
      { email: "liisa@example.com", name: "Liisa Järvinen", phone: null },
    ].map(({ email, name, phone }) =>
      prisma.user.upsert({
        where: { email },
        update: {
          passwordHash,
          role: Role.PATIENT,
          active: true,
          name,
          phone,
        },
        create: {
          email,
          passwordHash,
          name,
          phone,
          role: Role.PATIENT,
          preferredLocale: Locale.EN,
          patientProfile: { create: {} },
        },
      }),
    ),
  );

  const appointmentInputs = [
    {
      id: "demo-appointment-matti-today",
      patientId: demoPatients[0]!.id,
      startsAt: demoLocalTime(0, 9 * 60),
      status: AppointmentStatus.COMPLETED,
      location: "Main clinic",
    },
    {
      id: "demo-appointment-sari-today",
      patientId: demoPatients[1]!.id,
      startsAt: demoLocalTime(0, 9 * 60 + 45),
      status: AppointmentStatus.CONFIRMED,
      location: "Main clinic",
    },
    {
      id: "demo-appointment-juha-today",
      patientId: demoPatients[2]!.id,
      startsAt: demoLocalTime(0, 11 * 60),
      status: AppointmentStatus.CONFIRMED,
      location: "Main clinic",
    },
    {
      id: "demo-appointment-liisa-tomorrow",
      patientId: demoPatients[3]!.id,
      startsAt: demoLocalTime(1, 10 * 60),
      status: AppointmentStatus.CONFIRMED,
      location: "East clinic",
    },
  ];

  for (const input of appointmentInputs) {
    await prisma.appointment.upsert({
      where: { id: input.id },
      update: {
        patientId: input.patientId,
        workerProfileId: worker.id,
        serviceId: generalPractice.id,
        startsAt: input.startsAt,
        endsAt: addMinutes(input.startsAt, worker.appointmentDurationMinutes),
        location: input.location,
        status: input.status,
        cancellationReason: null,
        canceledAt: null,
        updatedById: admin.id,
      },
      create: {
        id: input.id,
        patientId: input.patientId,
        workerProfileId: worker.id,
        serviceId: generalPractice.id,
        startsAt: input.startsAt,
        endsAt: addMinutes(input.startsAt, worker.appointmentDurationMinutes),
        location: input.location,
        status: input.status,
        createdById: input.patientId,
      },
    });
  }

  await prisma.timeOff.deleteMany({
    where: {
      workerProfileId: worker.id,
      reason: { in: ["Lunch break", "Conference leave"] },
    },
  });
  await prisma.timeOff.createMany({
    data: [
      {
        workerProfileId: worker.id,
        startsAt: demoLocalTime(0, 12 * 60),
        endsAt: demoLocalTime(0, 12 * 60 + 30),
        reason: "Lunch break",
      },
      {
        workerProfileId: worker.id,
        startsAt: demoLocalTime(8, 9 * 60),
        endsAt: demoLocalTime(8, 16 * 60),
        reason: "Conference leave",
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "seed.demoData",
      entityType: "system",
      entityId: "seed",
      metadata: JSON.stringify({
        demoUsers: ["admin@example.com", "worker@example.com", "patient@example.com"],
        demoPassword,
      }),
    },
  });

  await prisma.appointment.updateMany({
    where: {
      startsAt: { lt: new Date() },
      status: AppointmentStatus.CONFIRMED,
    },
    data: { status: AppointmentStatus.COMPLETED },
  });

  console.log("Seeded demo data.");
  console.log("Demo password:", demoPassword);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
