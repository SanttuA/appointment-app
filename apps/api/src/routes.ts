import type { FastifyInstance } from "fastify";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAppointmentRoutes } from "./routes/appointments.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerWorkerRoutes } from "./routes/worker.js";

export function registerRoutes(app: FastifyInstance) {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerCatalogRoutes(app);
  registerAppointmentRoutes(app);
  registerWorkerRoutes(app);
  registerAdminRoutes(app);
}
