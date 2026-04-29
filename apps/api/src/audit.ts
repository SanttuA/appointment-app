import { prisma } from "./db.js";
import type { Prisma } from "./generated/prisma/client.js";

export async function auditLog(input: {
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
  };
  if (input.actorId !== undefined) data.actorId = input.actorId;
  if (input.metadata !== undefined) data.metadata = JSON.stringify(input.metadata);

  await prisma.auditLog.create({
    data,
  });
}
