import "dotenv/config";
import { hashPassword } from "../src/auth.js";
import { prisma } from "../src/db.js";
import { AppointmentStatus, Locale, Role } from "../src/generated/prisma/client.js";

const demoPassword = "DemoPassword123!";

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
      timezone: "Europe/Helsinki",
      appointmentDurationMinutes: 30,
      active: true,
    },
    create: {
      userId: workerUser.id,
      title: "General practitioner",
      bio: "Primary care appointments in English and Finnish.",
      timezone: "Europe/Helsinki",
      appointmentDurationMinutes: 30,
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
    data: [1, 2, 3, 4, 5].map((weekday) => ({
      workerProfileId: worker.id,
      weekday,
      startMinute: 9 * 60,
      endMinute: 16 * 60,
      active: true,
    })),
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
