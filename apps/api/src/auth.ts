import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { env } from "./config.js";
import { prisma } from "./db.js";
import { ApiError } from "./errors.js";
import { Role, type Prisma, type User } from "./generated/prisma/client.js";

export const sessionCookieName = "appointment_session";

const sessionUserInclude = {
  patientProfile: true,
  workerProfile: true,
} satisfies Prisma.UserInclude;

export type SessionUser = Prisma.UserGetPayload<{ include: typeof sessionUserInclude }>;

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
  });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(`${env.SESSION_SECRET}:${token}`).digest("hex");
}

export async function createSession(reply: FastifyReply, userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  reply.setCookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[sessionCookieName];
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  reply.clearCookie(sessionCookieName, { path: "/" });
}

export async function getSessionUser(request: FastifyRequest): Promise<SessionUser | null> {
  const token = request.cookies[sessionCookieName];
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: sessionUserInclude,
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.active) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  return session.user;
}

export async function requireAuth(request: FastifyRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required");
  }
  return user;
}

export async function requireRole(request: FastifyRequest, roles: Role[]) {
  const user = await requireAuth(request);
  if (!roles.includes(user.role)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission for this action");
  }
  return user;
}

export function serializeUser(user: User | SessionUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    phone: user.phone,
    preferredLocale: user.preferredLocale.toLowerCase(),
    active: user.active,
    workerProfile:
      "workerProfile" in user && user.workerProfile
        ? {
            id: user.workerProfile.id,
            title: user.workerProfile.title,
            location: user.workerProfile.location,
            timezone: user.workerProfile.timezone,
            appointmentDurationMinutes: user.workerProfile.appointmentDurationMinutes,
            active: user.workerProfile.active,
          }
        : null,
    patientProfile:
      "patientProfile" in user && user.patientProfile ? { id: user.patientProfile.id } : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export { Role };
