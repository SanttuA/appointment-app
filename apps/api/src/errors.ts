import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly params?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function mapError(error: FastifyError | Error) {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          params: error.params ?? {},
        },
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request validation failed",
          params: { issues: error.issues },
        },
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error",
        params: {},
      },
    },
  };
}

export function errorHandler(error: FastifyError, _request: FastifyRequest, reply: FastifyReply) {
  const mapped = mapError(error);
  if (mapped.statusCode >= 500) {
    _request.log.error(error);
  }
  void reply.status(mapped.statusCode).send(mapped.body);
}
