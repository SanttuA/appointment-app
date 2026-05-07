import type { Locale } from "@/i18n/routing";

export type Role = "PATIENT" | "WORKER" | "ADMIN";
export type PatientTab = "book" | "appointments";
export type WorkerTab = "agenda" | "week" | "schedule";
export type AdminTab = "overview" | "users" | "services" | "booking";
export type AppointmentStatus = "CONFIRMED" | "CANCELED" | "COMPLETED" | "NO_SHOW";
export type WorkerAppointmentStatusAction = Extract<AppointmentStatus, "COMPLETED" | "NO_SHOW">;

export type User = {
  id: string;
  email: string;
  role: Role;
  name: string;
  phone: string | null;
  preferredLocale: Locale;
  active: boolean;
  workerProfile: null | {
    id: string;
    title: string;
    location: string;
    timezone: string;
    appointmentDurationMinutes: number;
    bufferMinutes: number;
    bookingWindowDays: number;
    minimumNoticeMinutes: number;
    active: boolean;
  };
};

export type LocalizedText = {
  en: string | null;
  fi: string | null;
};

export type Service = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  active: boolean;
};

export type Worker = {
  id: string;
  name: string;
  title: string;
  location: string;
  timezone: string;
  appointmentDurationMinutes: number;
  bufferMinutes: number;
  bookingWindowDays: number;
  minimumNoticeMinutes: number;
  active: boolean;
  services: Service[];
};

export type Slot = {
  startsAt: string;
  endsAt: string;
  location?: string | null;
  status?: "AVAILABLE" | "TAKEN";
};

export type BookingContext = {
  slot: Slot;
  serviceId: string;
  workerId: string;
};

export type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  patient: {
    name: string;
    email: string;
    phone: string | null;
  };
  worker: {
    id: string;
    name: string;
    title: string;
    location: string;
    timezone: string;
  };
  service: Service;
  location: string | null;
  cancellationReason?: string | null;
  canceledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AvailabilityWindow = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  location: string | null;
  active: boolean;
};

export type TimeOff = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export type PendingConfirmation =
  | {
      type: "cancelAppointment";
      appointment: Appointment;
    }
  | {
      type: "updateAppointmentStatus";
      appointment: Appointment;
      status: WorkerAppointmentStatusAction;
    }
  | {
      type: "deleteTimeOff";
      entry: TimeOff;
    };

export type WorkerDayForm = {
  weekday: number;
  active: boolean;
  start: string;
  end: string;
  location: string;
  breakStart?: string;
  breakEnd?: string;
};

export type AdminDrawer =
  | {
      mode: "create" | "edit";
      type: "user";
      userId?: string;
    }
  | {
      mode: "create" | "edit";
      type: "service";
      serviceId?: string;
    };

export type AdminUserForm = {
  active: boolean;
  email: string;
  name: string;
  phone: string;
  preferredLocale: Locale;
  role: Role;
  workerLocation: string;
};

export type AdminServiceForm = {
  active: boolean;
  descriptionEn: string;
  descriptionFi: string;
  nameEn: string;
  nameFi: string;
};

export type SlotCountsByDate = Map<string, { available: number; total: number }>;
