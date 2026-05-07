"use client";

import {
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Languages,
  LogOut,
  MapPin,
  Plus,
  Settings,
  Shield,
  Stethoscope,
  Trash2,
  UserCircle,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";

type Role = "PATIENT" | "WORKER" | "ADMIN";
type PatientTab = "book" | "appointments";
type WorkerTab = "agenda" | "week" | "schedule";
type AdminTab = "overview" | "users" | "services" | "booking";
type AppointmentStatus = "CONFIRMED" | "CANCELED" | "COMPLETED" | "NO_SHOW";
type WorkerAppointmentStatusAction = Extract<AppointmentStatus, "COMPLETED" | "NO_SHOW">;

type User = {
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

type LocalizedText = {
  en: string | null;
  fi: string | null;
};

type Service = {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  active: boolean;
};

type Worker = {
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

type Slot = {
  startsAt: string;
  endsAt: string;
  location?: string | null;
  status?: "AVAILABLE" | "TAKEN";
};

type BookingContext = {
  slot: Slot;
  serviceId: string;
  workerId: string;
};

type Appointment = {
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

type AvailabilityWindow = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  location: string | null;
  active: boolean;
};

type TimeOff = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

type PendingConfirmation =
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

type WorkerDayForm = {
  weekday: number;
  active: boolean;
  start: string;
  end: string;
  location: string;
  breakStart?: string;
  breakEnd?: string;
};

type AdminDrawer =
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

type AppDialogProps = {
  children: React.ReactNode;
  className: string;
  labelledBy: string;
  onClose: () => void;
  backdropClassName: string;
  describedBy?: string;
  testId: string;
};

function AppDialog({
  backdropClassName,
  children,
  className,
  describedBy,
  labelledBy,
  onClose,
  testId,
}: AppDialogProps) {
  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    onClose();
  }

  return (
    <div className={backdropClassName} data-testid={testId} onClick={handleBackdropClick}>
      <section
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={className}
        role="dialog"
      >
        {children}
      </section>
    </div>
  );
}

type AdminUserForm = {
  active: boolean;
  email: string;
  name: string;
  phone: string;
  preferredLocale: Locale;
  role: Role;
  workerLocation: string;
};

type AdminServiceForm = {
  active: boolean;
  descriptionEn: string;
  descriptionFi: string;
  nameEn: string;
  nameFi: string;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const bookingHorizonDays = 90;
const cancellationPolicyWarningHours = 24;
const dateStripDayCount = 14;
const dateStripCenterOffset = 6;
const scheduleWeekdays = [1, 2, 3, 4, 5, 6, 0];

function formatLocalInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function tomorrowInputDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatLocalInputDate(date);
}

function inputDateToUtcDate(inputDate: string) {
  return new Date(`${inputDate}T00:00:00.000Z`);
}

function parseInputDate(inputDate: string) {
  const [year, month, day] = inputDate.split("-").map(Number);
  return { day: day ?? 1, month: month ?? 1, year: year ?? 1970 };
}

function timeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
  const entries = formatter
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]);
  const parts = Object.fromEntries(entries) as Record<Intl.DateTimeFormatPartTypes, number>;
  return {
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    month: parts.month,
    second: parts.second,
    year: parts.year,
  };
}

function getOffsetMinutes(date: Date, timeZone: string) {
  const parts = timeZoneParts(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return (localAsUtc - date.getTime()) / 60_000;
}

function inputDateStartInTimeZone(inputDate: string, timeZone: string) {
  const { day, month, year } = parseInputDate(inputDate);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const firstOffset = getOffsetMinutes(new Date(utcGuess), timeZone);
  const firstUtc = utcGuess - firstOffset * 60_000;
  const secondOffset = getOffsetMinutes(new Date(firstUtc), timeZone);
  return new Date(utcGuess - secondOffset * 60_000);
}

function addDays(inputDate: string, days: number) {
  const date = inputDateToUtcDate(inputDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clampInputDate(inputDate: string, minDate: string, maxDate: string) {
  if (inputDate < minDate) return minDate;
  if (inputDate > maxDate) return maxDate;
  return inputDate;
}

function monthStart(inputDate: string) {
  const date = inputDateToUtcDate(inputDate);
  date.setUTCDate(1);
  return date.toISOString().slice(0, 10);
}

function addMonths(inputDate: string, months: number) {
  const date = inputDateToUtcDate(monthStart(inputDate));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function calendarMonthDays(inputDate: string) {
  const start = inputDateToUtcDate(monthStart(inputDate));
  const leadingDays = (start.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const days: (string | null)[] = Array.from({ length: leadingDays }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
    days.push(date.toISOString().slice(0, 10));
  }

  while (days.length < 42) {
    days.push(null);
  }

  return days;
}

function calendarWeekdayLabels(locale: Locale) {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
}

function monthLabel(inputDate: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(inputDateToUtcDate(inputDate));
}

function fullDateLabel(inputDate: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(inputDateToUtcDate(inputDate));
}

function centerDateStripStart(inputDate: string, minDate: string, maxDate: string) {
  const centeredStart = addDays(inputDate, -dateStripCenterOffset);
  const maxStripStart = addDays(maxDate, -(dateStripDayCount - 1));
  return clampInputDate(centeredStart, minDate, maxStripStart);
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const data = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (!response.ok) {
    throw new Error(data.error?.code ?? data.error?.message ?? "REQUEST_FAILED");
  }
  return data as T;
}

function serviceName(service: Service, locale: Locale) {
  return service.name[locale] ?? service.name.en ?? service.id;
}

function formatDateTime(value: string, locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function formatTime(value: string, locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function formatDateKey(value: string | Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function localHour(value: string, timeZone?: string) {
  const part = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone,
  })
    .formatToParts(new Date(value))
    .find((item) => item.type === "hour")?.value;
  return Number(part ?? 0);
}

function weekdayLabel(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function dayNumber(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function isWeekend(value: string) {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function calendarDate(value: string) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function appointmentLocation(appointment: Appointment) {
  return appointment.location ?? appointment.worker.location;
}

function appointmentStartsWithinHours(appointment: Appointment, hours: number) {
  const startsInMs = new Date(appointment.startsAt).getTime() - Date.now();
  return startsInMs < hours * 60 * 60 * 1000;
}

function calendarHref(appointment: Appointment, locale: Locale) {
  const service = serviceName(appointment.service, locale);
  const summary = `${service} - ${appointment.worker.name}`;
  const description =
    locale === "fi"
      ? `Ajanvaraus: ${appointment.worker.name}. Peru aika sovelluksessa tarvittaessa.`
      : `Appointment with ${appointment.worker.name}. Cancel from the appointment app if needed.`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Appointment App//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@appointment-app`,
    `DTSTAMP:${calendarDate(new Date().toISOString())}`,
    `DTSTART:${calendarDate(appointment.startsAt)}`,
    `DTEND:${calendarDate(appointment.endsAt)}`,
    `SUMMARY:${escapeCalendarText(summary)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `LOCATION:${escapeCalendarText(appointmentLocation(appointment))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function timeToMinute(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function minuteToTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function inputDateMinuteInTimeZone(inputDate: string, minuteOfDay: number, timeZone: string) {
  const { day, month, year } = parseInputDate(inputDate);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = getOffsetMinutes(new Date(utcGuess), timeZone);
  const firstUtc = utcGuess - firstOffset * 60_000;
  const secondOffset = getOffsetMinutes(new Date(firstUtc), timeZone);
  return new Date(utcGuess - secondOffset * 60_000);
}

function weekStartMonday(inputDate: string) {
  const date = inputDateToUtcDate(inputDate);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function ceilToSlotStep(minutes: number) {
  return Math.ceil(minutes / 15) * 15;
}

function roleLabel(role: Role, t: ReturnType<typeof useTranslations>) {
  if (role === "ADMIN") return t("roles.admin");
  if (role === "WORKER") return t("roles.worker");
  return t("roles.patient");
}

function servicesForWorker(worker: Worker | undefined, fallbackServices: Service[]) {
  if (!worker) return fallbackServices;
  const activeCatalogIds = new Set(fallbackServices.map((service) => service.id));
  return worker.services.filter(
    (service) => service.active && (!activeCatalogIds.size || activeCatalogIds.has(service.id)),
  );
}

function defaultServiceIdForWorker(worker: Worker | undefined, fallbackServices: Service[]) {
  return servicesForWorker(worker, fallbackServices)[0]?.id ?? "";
}

function workerSupportsService(
  worker: Worker | undefined,
  serviceId: string,
  fallbackServices: Service[],
) {
  return Boolean(
    serviceId &&
    servicesForWorker(worker, fallbackServices).some((service) => service.id === serviceId),
  );
}

function defaultWorkerDayForms(location = "Main clinic"): WorkerDayForm[] {
  return scheduleWeekdays.map((weekday) => ({
    weekday,
    active: weekday >= 1 && weekday <= 5,
    start: "09:00",
    end: "16:00",
    location,
  }));
}

function SlotGroup({
  actionLabel,
  locale,
  requestBooking,
  readOnly = false,
  saving,
  slots,
  timeZone,
  title,
  user,
  userCanBook,
}: {
  actionLabel: string;
  locale: Locale;
  requestBooking: (slot: Slot) => void;
  readOnly?: boolean;
  saving: boolean;
  slots: Slot[];
  timeZone: string | undefined;
  title: string;
  user: User | null;
  userCanBook: boolean;
}) {
  const t = useTranslations();

  return (
    <section>
      <h3 className="text-sm font-bold uppercase text-[var(--muted)]">{title}</h3>
      <div className="mt-3 grid min-w-0 gap-3 xl:grid-cols-2">
        {slots.map((slot) => {
          const taken = (slot.status ?? "AVAILABLE") === "TAKEN";
          return (
            <div
              className={[
                "surface flex min-h-20 min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between",
                taken ? "bg-slate-50 text-slate-500 opacity-75" : "",
              ].join(" ")}
              key={slot.startsAt}
            >
              <span className="text-lg font-semibold">
                {formatTime(slot.startsAt, locale, timeZone)}
              </span>
              {taken ? (
                <span className="font-semibold">{t("booking.taken")}</span>
              ) : readOnly ? (
                <span className="rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
                  {t("admin.booking.available")}
                </span>
              ) : (
                <button
                  className="btn-primary min-w-24"
                  disabled={(user !== null && !userCanBook) || saving}
                  onClick={() => requestBooking(slot)}
                  type="button"
                >
                  {actionLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DatePickerCalendar({
  bookingMaxDate,
  bookingMinDate,
  calendarMonth,
  locale,
  selectCalendarDate,
  selectedDate,
  setCalendarMonth,
  slotCountsByDate,
}: {
  bookingMaxDate: string;
  bookingMinDate: string;
  calendarMonth: string;
  locale: Locale;
  selectCalendarDate: (date: string) => void;
  selectedDate: string;
  setCalendarMonth: (date: string) => void;
  slotCountsByDate: Map<string, { available: number; total: number }>;
}) {
  const t = useTranslations();
  const days = useMemo(() => calendarMonthDays(calendarMonth), [calendarMonth]);
  const weekdays = useMemo(() => calendarWeekdayLabels(locale), [locale]);
  const minMonth = monthStart(bookingMinDate);
  const maxMonth = monthStart(bookingMaxDate);
  const canGoPrevious = calendarMonth > minMonth;
  const canGoNext = calendarMonth < maxMonth;

  return (
    <aside className="surface min-w-0 p-4" aria-label={t("booking.calendar")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase text-[var(--muted)]">
            {t("booking.calendar")}
          </h3>
          <p className="mt-1 font-bold">{monthLabel(calendarMonth, locale)}</p>
        </div>
        <div className="flex gap-2">
          <button
            aria-label={t("booking.previousMonth")}
            className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)] disabled:opacity-40"
            disabled={!canGoPrevious}
            onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <button
            aria-label={t("booking.nextMonth")}
            className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)] disabled:opacity-40"
            disabled={!canGoNext}
            onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {weekdays.map((weekday) => (
          <span className="text-xs font-bold uppercase text-[var(--muted)]" key={weekday}>
            {weekday}
          </span>
        ))}
        {days.map((date, index) => {
          if (!date) {
            return <span aria-hidden="true" className="h-11" key={`empty-${index}`} />;
          }

          const counts = slotCountsByDate.get(date) ?? { available: 0, total: 0 };
          const selected = selectedDate === date;
          const inBookingWindow = date >= bookingMinDate && date <= bookingMaxDate;
          const available = counts.available > 0;
          return (
            <button
              aria-current={selected ? "date" : undefined}
              aria-label={fullDateLabel(date, locale)}
              className={[
                "grid h-11 min-w-0 place-items-center rounded-md border text-sm font-bold transition disabled:opacity-30",
                selected
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-transparent bg-white text-[var(--foreground)] hover:border-[var(--line)]",
                isWeekend(date) && !selected ? "text-[var(--muted)]" : "",
              ].join(" ")}
              data-testid={`calendar-date-${date}`}
              disabled={!inBookingWindow}
              key={date}
              onClick={() => selectCalendarDate(date)}
              type="button"
            >
              <span>{dayNumber(date)}</span>
              {counts.total > 0 ? (
                <span
                  aria-hidden="true"
                  className={[
                    "h-1.5 w-1.5 rounded-full",
                    selected ? "bg-white" : available ? "bg-teal-600" : "bg-slate-400",
                  ].join(" ")}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function AppointmentClient({ locale }: { locale: Locale }) {
  const t = useTranslations();
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("patient@example.com");
  const [password, setPassword] = useState("DemoPassword123!");
  const [name, setName] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [bookingMinDate] = useState(tomorrowInputDate);
  const [dateStripStart, setDateStripStart] = useState(bookingMinDate);
  const [selectedDate, setSelectedDate] = useState(bookingMinDate);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(bookingMinDate));
  const [activeTab, setActiveTab] = useState<PatientTab>("book");
  const [workerTab, setWorkerTab] = useState<WorkerTab>("agenda");
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [saving, setSaving] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [pendingBooking, setPendingBooking] = useState<BookingContext | null>(null);
  const [bookingDialogContext, setBookingDialogContext] = useState<BookingContext | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [reschedulingAppointment, setReschedulingAppointment] = useState<Appointment | null>(null);
  const [focusAppointmentId, setFocusAppointmentId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workerLocation, setWorkerLocation] = useState("Main clinic");
  const [workerDays, setWorkerDays] = useState<WorkerDayForm[]>(() =>
    defaultWorkerDayForms("Main clinic"),
  );
  const [workerBreakStart, setWorkerBreakStart] = useState("12:00");
  const [workerBreakEnd, setWorkerBreakEnd] = useState("12:30");
  const [appointmentDurationMinutes, setAppointmentDurationMinutes] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [workerBookingWindowDays, setWorkerBookingWindowDays] = useState(90);
  const [minimumNoticeMinutes, setMinimumNoticeMinutes] = useState(0);
  const [workerTimeOff, setWorkerTimeOff] = useState<TimeOff[]>([]);
  const [workerWeekStart, setWorkerWeekStart] = useState(() =>
    weekStartMonday(formatLocalInputDate(new Date())),
  );
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockDate, setBlockDate] = useState(() => formatLocalInputDate(new Date()));
  const [blockStart, setBlockStart] = useState("12:00");
  const [blockEnd, setBlockEnd] = useState("12:30");
  const [blockReason, setBlockReason] = useState("Lunch break");
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminServices, setAdminServices] = useState<Service[]>([]);
  const [adminAppointments, setAdminAppointments] = useState<Appointment[]>([]);
  const [adminAvailableSlotsToday, setAdminAvailableSlotsToday] = useState(0);
  const [adminDrawer, setAdminDrawer] = useState<AdminDrawer | null>(null);
  const [adminUserForm, setAdminUserForm] = useState<AdminUserForm>({
    active: true,
    email: "",
    name: "",
    phone: "",
    preferredLocale: locale,
    role: "WORKER",
    workerLocation: "Main clinic",
  });
  const [adminServiceForm, setAdminServiceForm] = useState<AdminServiceForm>({
    active: true,
    descriptionEn: "",
    descriptionFi: "",
    nameEn: "",
    nameFi: "",
  });
  const authFirstFieldRef = useRef<HTMLInputElement>(null);
  const bookingCloseButtonRef = useRef<HTMLButtonElement>(null);
  const blockFirstFieldRef = useRef<HTMLInputElement>(null);
  const confirmationCancelButtonRef = useRef<HTMLButtonElement>(null);
  const adminDrawerCloseButtonRef = useRef<HTMLButtonElement>(null);
  const bookingTabRef = useRef<HTMLButtonElement>(null);
  const appointmentsTabRef = useRef<HTMLButtonElement>(null);
  const appointmentCardRefs = useRef(new Map<string, HTMLDivElement>());
  const latestSlotsRequestRef = useRef(0);

  const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId);
  const selectableServices = servicesForWorker(selectedWorker, services);
  const selectedWorkerSupportsService = workerSupportsService(
    selectedWorker,
    selectedServiceId,
    services,
  );
  const bookingMaxDate = useMemo(
    () => addDays(bookingMinDate, bookingHorizonDays - 1),
    [bookingMinDate],
  );
  const dateStripDays = useMemo(
    () => Array.from({ length: dateStripDayCount }, (_, index) => addDays(dateStripStart, index)),
    [dateStripStart],
  );

  const userCanBook = user?.role === "PATIENT";
  const profileInitial =
    user?.name.trim().charAt(0).toUpperCase() || user?.email.charAt(0).toUpperCase();

  const upcomingAppointments = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter(
        (appointment) =>
          appointment.status === "CONFIRMED" && new Date(appointment.startsAt).getTime() > now,
      )
      .sort(
        (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      );
  }, [appointments]);

  const pastAppointments = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter(
        (appointment) =>
          appointment.status !== "CONFIRMED" || new Date(appointment.startsAt).getTime() <= now,
      )
      .sort(
        (left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime(),
      );
  }, [appointments]);

  const upcomingAppointment = user?.role === "PATIENT" ? (upcomingAppointments[0] ?? null) : null;
  const appointmentBadgeCount = upcomingAppointments.length;

  const appointmentFormatter = useMemo(
    () => (appointment: Appointment) =>
      `${formatDateTime(
        appointment.startsAt,
        locale,
        appointment.worker.timezone,
      )} · ${serviceName(appointment.service, locale)} · ${appointment.worker.name}`,
    [locale],
  );

  const slotsForSelectedDate = useMemo(
    () =>
      slots
        .filter((slot) => formatDateKey(slot.startsAt, selectedWorker?.timezone) === selectedDate)
        .sort(
          (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        ),
    [selectedDate, selectedWorker?.timezone, slots],
  );

  const slotCountsByDate = useMemo(() => {
    const counts = new Map<string, { available: number; total: number }>();
    for (const slot of slots) {
      const key = formatDateKey(slot.startsAt, selectedWorker?.timezone);
      const current = counts.get(key) ?? { available: 0, total: 0 };
      current.total += 1;
      if ((slot.status ?? "AVAILABLE") === "AVAILABLE") current.available += 1;
      counts.set(key, current);
    }
    return counts;
  }, [selectedWorker?.timezone, slots]);

  const morningSlots = slotsForSelectedDate.filter(
    (slot) => localHour(slot.startsAt, selectedWorker?.timezone) < 12,
  );
  const afternoonSlots = slotsForSelectedDate.filter(
    (slot) => localHour(slot.startsAt, selectedWorker?.timezone) >= 12,
  );

  const calendarDownloadHref = useMemo(
    () => (confirmedAppointment ? calendarHref(confirmedAppointment, locale) : null),
    [confirmedAppointment, locale],
  );
  const bookingDialogWorker = bookingDialogContext
    ? workers.find((worker) => worker.id === bookingDialogContext.workerId)
    : undefined;
  const pendingBookingWorker = pendingBooking
    ? workers.find((worker) => worker.id === pendingBooking.workerId)
    : undefined;
  const bookingDialogSelectedService = bookingDialogContext
    ? (services.find((service) => service.id === bookingDialogContext.serviceId) ??
      bookingDialogWorker?.services.find(
        (service) => service.id === bookingDialogContext.serviceId,
      ))
    : undefined;
  const bookingDialogOpen = Boolean(bookingDialogContext || confirmedAppointment);
  const bookingDialogTime = confirmedAppointment
    ? formatDateTime(confirmedAppointment.startsAt, locale, confirmedAppointment.worker.timezone)
    : bookingDialogContext
      ? formatDateTime(bookingDialogContext.slot.startsAt, locale, bookingDialogWorker?.timezone)
      : "";
  const bookingDialogClinician =
    confirmedAppointment?.worker.name ?? bookingDialogWorker?.name ?? "";
  const bookingDialogService = confirmedAppointment
    ? serviceName(confirmedAppointment.service, locale)
    : bookingDialogSelectedService
      ? serviceName(bookingDialogSelectedService, locale)
      : "";
  const bookingDialogLocation = confirmedAppointment
    ? appointmentLocation(confirmedAppointment)
    : (bookingDialogContext?.slot.location ?? bookingDialogWorker?.location ?? "");
  const isReschedulingBooking = Boolean(reschedulingAppointment && bookingDialogContext);
  const slotActionLabel = reschedulingAppointment
    ? t("appointments.reschedule")
    : t("booking.book");
  const slotUserCanBook = reschedulingAppointment ? Boolean(user) : userCanBook;
  const bookingDialogTitle = confirmedAppointment
    ? t("booking.confirmedTitle")
    : isReschedulingBooking
      ? t("booking.rescheduleConfirmTitle")
      : t("booking.confirmTitle");
  const bookingDialogSubtitle = isReschedulingBooking
    ? t("booking.rescheduleConfirmSubtitle")
    : t("booking.confirmSubtitle");
  const bookingDialogGuidance = isReschedulingBooking
    ? t("booking.rescheduleGuidance")
    : t("booking.cancelGuidance");
  const workerTimeZone =
    user?.workerProfile?.timezone ?? selectedWorker?.timezone ?? "Europe/Helsinki";
  const workerToday = formatDateKey(new Date(), workerTimeZone);
  const workerWeekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(workerWeekStart, index)),
    [workerWeekStart],
  );
  const workerWeekEnd = workerWeekDays.at(-1) ?? workerWeekStart;
  const todayAgendaAppointments = useMemo(
    () =>
      appointments
        .filter(
          (appointment) => formatDateKey(appointment.startsAt, workerTimeZone) === workerToday,
        )
        .sort(
          (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        ),
    [appointments, workerTimeZone, workerToday],
  );
  const weekAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        const key = formatDateKey(appointment.startsAt, workerTimeZone);
        return key >= workerWeekStart && key <= workerWeekEnd;
      }),
    [appointments, workerTimeZone, workerWeekEnd, workerWeekStart],
  );
  const upcomingTimeOff = useMemo(() => {
    const now = Date.now();
    return workerTimeOff
      .filter((entry) => new Date(entry.endsAt).getTime() >= now)
      .sort(
        (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      );
  }, [workerTimeOff]);
  const adminToday = formatDateKey(new Date(), "Europe/Helsinki");
  const adminWeekStart = weekStartMonday(adminToday);
  const adminWeekEnd = addDays(adminWeekStart, 6);
  const adminTodayAppointments = useMemo(
    () =>
      adminAppointments
        .filter(
          (appointment) =>
            appointment.status === "CONFIRMED" &&
            formatDateKey(appointment.startsAt, appointment.worker.timezone) ===
              formatDateKey(new Date(), appointment.worker.timezone),
        )
        .sort(
          (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        ),
    [adminAppointments],
  );
  const adminCancellationsThisWeek = useMemo(
    () =>
      adminAppointments.filter((appointment) => {
        if (appointment.status !== "CANCELED") return false;
        const dateKey = formatDateKey(
          appointment.canceledAt ?? appointment.updatedAt ?? appointment.startsAt,
          "Europe/Helsinki",
        );
        return dateKey >= adminWeekStart && dateKey <= adminWeekEnd;
      }).length,
    [adminAppointments, adminWeekEnd, adminWeekStart],
  );
  const adminWorkerCount = adminUsers.filter((adminUser) => adminUser.role === "WORKER").length;
  const adminPatientCount = adminUsers.filter((adminUser) => adminUser.role === "PATIENT").length;

  async function loadCatalog() {
    const [serviceData, workerData] = await Promise.all([
      apiRequest<{ services: Service[] }>("/services"),
      apiRequest<{ workers: Worker[] }>("/workers"),
    ]);
    setServices(serviceData.services);
    setWorkers(workerData.workers);
    const fallbackWorker = workerData.workers[0];
    const nextWorker =
      workerData.workers.find((worker) => worker.id === selectedWorkerId) ?? fallbackWorker;
    const nextServiceId = workerSupportsService(nextWorker, selectedServiceId, serviceData.services)
      ? selectedServiceId
      : defaultServiceIdForWorker(nextWorker, serviceData.services);

    setSelectedWorkerId(nextWorker?.id ?? "");
    setSelectedServiceId(nextServiceId);
    return workerData.workers;
  }

  async function loadAdminAvailableSlotsToday(workerData: Worker[], activeServices: Service[]) {
    const slotCounts = await Promise.all(
      workerData
        .filter((worker) => worker.active)
        .map(async (worker) => {
          const serviceId = servicesForWorker(worker, activeServices)[0]?.id;
          if (!serviceId) return 0;
          const today = formatDateKey(new Date(), worker.timezone);
          const from = inputDateStartInTimeZone(today, worker.timezone);
          const to = inputDateStartInTimeZone(addDays(today, 1), worker.timezone);
          const params = new URLSearchParams({
            serviceId,
            from: from.toISOString(),
            to: to.toISOString(),
            includeTaken: "true",
          });

          try {
            const data = await apiRequest<{ slots: Slot[] }>(
              `/workers/${worker.id}/slots?${params.toString()}`,
            );
            return data.slots.filter((slot) => (slot.status ?? "AVAILABLE") === "AVAILABLE").length;
          } catch {
            return 0;
          }
        }),
    );

    setAdminAvailableSlotsToday(slotCounts.reduce((total, count) => total + count, 0));
  }

  async function loadAdminData(workerData = workers) {
    const [userData, serviceData, appointmentData, activeServiceData] = await Promise.all([
      apiRequest<{ users: User[] }>("/admin/users"),
      apiRequest<{ services: Service[] }>("/admin/services"),
      apiRequest<{ appointments: Appointment[] }>("/admin/appointments"),
      apiRequest<{ services: Service[] }>("/services"),
    ]);
    setAdminUsers(userData.users);
    setAdminServices(serviceData.services);
    setAdminAppointments(appointmentData.appointments);
    await loadAdminAvailableSlotsToday(workerData, activeServiceData.services);
  }

  async function refreshSession(catalogWorkers = workers) {
    const data = await apiRequest<{ user: User | null }>("/auth/me");
    setUser(data.user);
    if (data.user) {
      if (data.user.role === "ADMIN") {
        setAppointments([]);
        setWorkerTimeOff([]);
        await loadAdminData(catalogWorkers);
        return;
      }
      const appointmentData = await apiRequest<{ appointments: Appointment[] }>("/appointments");
      setAppointments(appointmentData.appointments);
      if (data.user.role === "WORKER") {
        await loadWorkerSettings();
      } else {
        setWorkerTimeOff([]);
      }
    } else {
      setAppointments([]);
      setReschedulingAppointment(null);
      setWorkerTimeOff([]);
      setAdminUsers([]);
      setAdminServices([]);
      setAdminAppointments([]);
      setAdminAvailableSlotsToday(0);
      setAdminDrawer(null);
    }
  }

  async function run(action: () => Promise<void>, success?: string) {
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await action();
      if (success) setNotice(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setSaving(false);
    }
  }

  function applyWorkerSettings(data: {
    worker: Worker;
    windows: AvailabilityWindow[];
    timeOff: TimeOff[];
  }) {
    setWorkerTimeOff(data.timeOff);
    setWorkerLocation(data.worker.location);
    setAppointmentDurationMinutes(data.worker.appointmentDurationMinutes);
    setBufferMinutes(data.worker.bufferMinutes);
    setWorkerBookingWindowDays(data.worker.bookingWindowDays);
    setMinimumNoticeMinutes(data.worker.minimumNoticeMinutes);

    const windowsByDay = new Map<number, AvailabilityWindow[]>();
    for (const window of data.windows) {
      if (!window.active) continue;
      const current = windowsByDay.get(window.weekday) ?? [];
      current.push(window);
      windowsByDay.set(window.weekday, current);
    }

    const nextDays = defaultWorkerDayForms(data.worker.location).map((day) => {
      const dayWindows = (windowsByDay.get(day.weekday) ?? []).sort(
        (left, right) => left.startMinute - right.startMinute,
      );
      if (!dayWindows.length) return { ...day, active: false };
      return {
        weekday: day.weekday,
        active: true,
        start: minuteToTime(dayWindows[0]?.startMinute ?? 9 * 60),
        end: minuteToTime(dayWindows.at(-1)?.endMinute ?? 16 * 60),
        location: dayWindows[0]?.location ?? data.worker.location,
        ...(dayWindows.length >= 2
          ? {
              breakStart: minuteToTime(dayWindows[0]?.endMinute ?? 12 * 60),
              breakEnd: minuteToTime(dayWindows[1]?.startMinute ?? 12 * 60 + 30),
            }
          : {}),
      };
    });
    setWorkerDays(nextDays);

    const splitDay = [...windowsByDay.values()].find((dayWindows) => dayWindows.length >= 2);
    if (splitDay) {
      const sorted = [...splitDay].sort((left, right) => left.startMinute - right.startMinute);
      setWorkerBreakStart(minuteToTime(sorted[0]?.endMinute ?? 12 * 60));
      setWorkerBreakEnd(minuteToTime(sorted[1]?.startMinute ?? 12 * 60 + 30));
    } else {
      setWorkerBreakStart("");
      setWorkerBreakEnd("");
    }
  }

  async function loadWorkerSettings() {
    const data = await apiRequest<{
      worker: Worker;
      windows: AvailabilityWindow[];
      timeOff: TimeOff[];
    }>("/worker/settings");
    applyWorkerSettings(data);
  }

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    void run(async () => {
      const catalogWorkers = await loadCatalog();
      await refreshSession(catalogWorkers);
    });
  }, []);

  useEffect(() => {
    if (user?.role === "WORKER") {
      latestSlotsRequestRef.current += 1;
      setSlots([]);
      return;
    }
    if (!selectedWorkerId || !selectedServiceId || !selectedWorkerSupportsService) {
      latestSlotsRequestRef.current += 1;
      setSlots([]);
      return;
    }
    void run(fetchSlots);
  }, [
    dateStripStart,
    selectedServiceId,
    selectedWorkerId,
    selectedWorkerSupportsService,
    user?.role,
  ]);

  useEffect(() => {
    if (!selectedWorkerId || !selectedWorker) return;
    if (selectedWorkerSupportsService) return;
    setSelectedServiceId(defaultServiceIdForWorker(selectedWorker, services));
    latestSlotsRequestRef.current += 1;
    setSlots([]);
  }, [
    selectedServiceId,
    selectedWorker,
    selectedWorkerId,
    selectedWorkerSupportsService,
    services,
  ]);

  useEffect(() => {
    if (user?.workerProfile?.location) {
      setWorkerLocation(user.workerProfile.location);
    }
  }, [user?.workerProfile?.location]);

  useEffect(() => {
    if (!authDialogOpen) return;
    const focusTimer = window.setTimeout(() => authFirstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [authDialogOpen, authMode]);

  useEffect(() => {
    const focusTarget = pendingConfirmation
      ? confirmationCancelButtonRef.current
      : adminDrawer
        ? adminDrawerCloseButtonRef.current
        : bookingDialogOpen
          ? bookingCloseButtonRef.current
          : blockDialogOpen
            ? blockFirstFieldRef.current
            : null;

    if (!focusTarget) return;
    const focusTimer = window.setTimeout(() => focusTarget.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [adminDrawer, blockDialogOpen, bookingDialogOpen, pendingConfirmation]);

  useEffect(() => {
    if (
      !authDialogOpen &&
      !bookingDialogOpen &&
      !blockDialogOpen &&
      !profileMenuOpen &&
      !pendingConfirmation &&
      !adminDrawer
    ) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (pendingConfirmation) {
        closeConfirmationDialog();
        return;
      }
      if (authDialogOpen) {
        closeAuthDialog();
        return;
      }
      if (bookingDialogOpen) {
        closeBookingDialog();
        return;
      }
      if (blockDialogOpen) {
        closeBlockDialog();
        return;
      }
      if (adminDrawer) {
        closeAdminDrawer();
        return;
      }
      setProfileMenuOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    adminDrawer,
    authDialogOpen,
    blockDialogOpen,
    bookingDialogOpen,
    pendingConfirmation,
    profileMenuOpen,
    saving,
  ]);

  useEffect(() => {
    if (activeTab !== "appointments" || !focusAppointmentId) return;

    const focusTimer = window.setTimeout(() => {
      const card = appointmentCardRefs.current.get(focusAppointmentId);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      card?.focus({ preventScroll: true });
      setFocusAppointmentId(null);
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [activeTab, appointments, focusAppointmentId]);

  function openAuthDialog(
    mode: "login" | "register" = "login",
    booking: BookingContext | null = null,
  ) {
    setAuthMode(mode);
    setPendingBooking(booking);
    setAuthError(null);
    setError(null);
    setNotice(null);
    setAuthDialogOpen(true);
    setProfileMenuOpen(false);
  }

  function closeAuthDialog() {
    if (saving) return;
    setAuthDialogOpen(false);
    setPendingBooking(null);
    setAuthError(null);
  }

  function updateWithViewTransition(update: () => void) {
    if (typeof document === "undefined") {
      update();
      return;
    }

    const viewTransitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => void;
    };
    if (typeof viewTransitionDocument.startViewTransition === "function") {
      viewTransitionDocument.startViewTransition(update);
      return;
    }

    update();
  }

  function switchMainTab(tab: PatientTab, appointmentId?: string) {
    updateWithViewTransition(() => {
      setActiveTab(tab);
      if (appointmentId) setFocusAppointmentId(appointmentId);
    });
  }

  function focusMainTab(tab: PatientTab) {
    switchMainTab(tab);
    window.requestAnimationFrame(() => {
      const tabRef = tab === "book" ? bookingTabRef : appointmentsTabRef;
      tabRef.current?.focus();
    });
  }

  function handleMainTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const nextTab = activeTab === "book" ? "appointments" : "book";
    let targetTab: PatientTab | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      targetTab = nextTab;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      targetTab = nextTab;
    } else if (event.key === "Home") {
      targetTab = "book";
    } else if (event.key === "End") {
      targetTab = "appointments";
    }

    if (!targetTab) return;
    event.preventDefault();
    focusMainTab(targetTab);
  }

  function setAppointmentCardRef(id: string) {
    return (node: HTMLDivElement | null) => {
      if (node) {
        appointmentCardRefs.current.set(id, node);
      } else {
        appointmentCardRefs.current.delete(id);
      }
    };
  }

  function appointmentStatusLabel(status: AppointmentStatus) {
    return t(`appointments.status.${status}`);
  }

  function appointmentStatusClass(status: AppointmentStatus) {
    if (status === "CONFIRMED") return "border-teal-200 bg-teal-50 text-teal-800";
    if (status === "CANCELED") return "border-red-200 bg-red-50 text-red-800";
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  function openAppointmentFromBanner(id: string) {
    switchMainTab("appointments", id);
  }

  function startReschedule(appointment: Appointment) {
    const appointmentDate = formatDateKey(appointment.startsAt, appointment.worker.timezone);
    const rescheduleDate = clampInputDate(appointmentDate, bookingMinDate, bookingMaxDate);

    updateWithViewTransition(() => {
      setReschedulingAppointment(appointment);
      setBookingDialogContext(null);
      setConfirmedAppointment(null);
      setSelectedWorkerId(appointment.worker.id);
      setSelectedServiceId(appointment.service.id);
      setSelectedDate(rescheduleDate);
      setCalendarMonth(monthStart(rescheduleDate));
      setDateStripStart(centerDateStripStart(rescheduleDate, bookingMinDate, bookingMaxDate));
      setActiveTab("book");
      setError(null);
      setNotice(null);
    });
  }

  function cancelReschedule() {
    setReschedulingAppointment(null);
    setBookingDialogContext(null);
    setConfirmedAppointment(null);
  }

  function selectStripDate(date: string) {
    setSelectedDate(date);
    const selectedMonth = monthStart(date);
    if (selectedMonth !== calendarMonth) {
      setCalendarMonth(selectedMonth);
    }
  }

  function selectCalendarDate(date: string) {
    const clampedDate = clampInputDate(date, bookingMinDate, bookingMaxDate);
    setSelectedDate(clampedDate);
    setCalendarMonth(monthStart(clampedDate));
    setDateStripStart(centerDateStripStart(clampedDate, bookingMinDate, bookingMaxDate));
  }

  async function fetchSlots() {
    if (!selectedWorkerId || !selectedServiceId || !selectedWorkerSupportsService) return;
    const requestId = latestSlotsRequestRef.current + 1;
    latestSlotsRequestRef.current = requestId;
    const workerTimeZone = selectedWorker?.timezone;
    if (!workerTimeZone) return;
    const from = inputDateStartInTimeZone(dateStripStart, workerTimeZone);
    const to = inputDateStartInTimeZone(addDays(dateStripStart, dateStripDayCount), workerTimeZone);
    const params = new URLSearchParams({
      serviceId: selectedServiceId,
      from: from.toISOString(),
      to: to.toISOString(),
      includeTaken: "true",
    });
    let data: { slots: Slot[] };
    try {
      data = await apiRequest<{ slots: Slot[] }>(
        `/workers/${selectedWorkerId}/slots?${params.toString()}`,
      );
    } catch (caught) {
      if (requestId !== latestSlotsRequestRef.current) return;
      throw caught;
    }
    if (requestId !== latestSlotsRequestRef.current) return;
    setSlots(data.slots);
  }

  async function createAppointment(booking: BookingContext) {
    const data = await apiRequest<{ appointment: Appointment }>("/appointments", {
      method: "POST",
      body: JSON.stringify({
        workerProfileId: booking.workerId,
        serviceId: booking.serviceId,
        startsAt: booking.slot.startsAt,
      }),
    });
    await Promise.all([refreshSession(), fetchSlots()]);
    return data.appointment;
  }

  async function rescheduleAppointment(appointment: Appointment, booking: BookingContext) {
    const data = await apiRequest<{ appointment: Appointment }>(
      `/appointments/${appointment.id}/reschedule`,
      {
        method: "PATCH",
        body: JSON.stringify({ startsAt: booking.slot.startsAt }),
      },
    );
    await Promise.all([refreshSession(), fetchSlots()]);
    return data.appointment;
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      if (authMode === "register") {
        await apiRequest<{ user: User }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            name,
            preferredLocale: locale,
          }),
        });
      } else {
        await apiRequest<{ user: User }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }
      await refreshSession();

      const bookingToConfirm = pendingBooking;
      setPendingBooking(null);
      setAuthDialogOpen(false);

      if (bookingToConfirm) {
        setBookingDialogContext(bookingToConfirm);
        setConfirmedAppointment(null);
        setNotice(t("notices.signedIn"));
      } else {
        setNotice(t("notices.signedIn"));
      }
    } catch (caught) {
      setAuthError(caught instanceof Error ? caught.message : "REQUEST_FAILED");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await run(async () => {
      await apiRequest("/auth/logout", { method: "POST" });
      setUser(null);
      setAppointments([]);
      setReschedulingAppointment(null);
      setProfileMenuOpen(false);
    }, t("notices.signedOut"));
  }

  async function loadSlots() {
    await run(fetchSlots);
  }

  async function bookSlot(booking: BookingContext) {
    if (reschedulingAppointment) {
      const appointmentToReschedule = reschedulingAppointment;
      await run(async () => {
        const appointment = await rescheduleAppointment(appointmentToReschedule, booking);
        setBookingDialogContext(null);
        setConfirmedAppointment(null);
        setReschedulingAppointment(null);
        switchMainTab("appointments", appointment.id);
      }, t("notices.appointmentRescheduled"));
      return;
    }

    await run(async () => {
      const appointment = await createAppointment(booking);
      setConfirmedAppointment(appointment);
    }, t("notices.appointmentBooked"));
  }

  function requestBooking(slot: Slot) {
    const booking = { serviceId: selectedServiceId, slot, workerId: selectedWorkerId };
    if (!user) {
      openAuthDialog("login", booking);
      return;
    }
    if (!reschedulingAppointment && !userCanBook) {
      setError("FORBIDDEN");
      setNotice(null);
      return;
    }
    setBookingDialogContext(booking);
    setConfirmedAppointment(null);
  }

  function closeBookingDialog() {
    if (saving) return;
    setBookingDialogContext(null);
    setConfirmedAppointment(null);
  }

  function openCancelAppointmentConfirmation(appointment: Appointment) {
    setPendingConfirmation({ appointment, type: "cancelAppointment" });
    setError(null);
    setNotice(null);
  }

  function openAppointmentStatusConfirmation(
    appointment: Appointment,
    status: WorkerAppointmentStatusAction,
  ) {
    setPendingConfirmation({ appointment, status, type: "updateAppointmentStatus" });
    setError(null);
    setNotice(null);
  }

  function openDeleteTimeOffConfirmation(entry: TimeOff) {
    setPendingConfirmation({ entry, type: "deleteTimeOff" });
    setError(null);
    setNotice(null);
  }

  function closeConfirmationDialog() {
    if (saving) return;
    setPendingConfirmation(null);
  }

  async function confirmPendingAction() {
    const confirmation = pendingConfirmation;
    if (!confirmation) return;

    if (confirmation.type === "cancelAppointment") {
      await cancelAppointment(confirmation.appointment.id);
    } else if (confirmation.type === "updateAppointmentStatus") {
      await updateAppointmentStatus(confirmation.appointment.id, confirmation.status);
    } else {
      await deleteTimeOff(confirmation.entry.id);
    }

    setPendingConfirmation(null);
  }

  async function cancelAppointment(id: string) {
    await run(async () => {
      await apiRequest(`/appointments/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Canceled by user" }),
      });
      if (user?.role === "WORKER") {
        await refreshSession();
      } else {
        await Promise.all([refreshSession(), fetchSlots()]);
      }
      if (reschedulingAppointment?.id === id) setReschedulingAppointment(null);
    }, t("notices.appointmentCanceled"));
  }

  async function saveAvailability(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const windows = workerDays.flatMap((day) => {
      if (!day.active) return [];
      const startMinute = timeToMinute(day.start);
      const endMinute = timeToMinute(day.end);
      if (endMinute <= startMinute) return [];
      const location = day.location.trim() || workerLocation;
      const breakStartMinute = timeToMinute(day.breakStart ?? "");
      const breakEndMinute = timeToMinute(day.breakEnd ?? "");
      const hasBreak = Boolean(day.breakStart && day.breakEnd && breakEndMinute > breakStartMinute);
      if (hasBreak && breakStartMinute > startMinute && breakEndMinute < endMinute) {
        return [
          {
            weekday: day.weekday,
            startMinute,
            endMinute: breakStartMinute,
            location,
            active: true,
          },
          {
            weekday: day.weekday,
            startMinute: breakEndMinute,
            endMinute,
            location,
            active: true,
          },
        ];
      }
      return [{ weekday: day.weekday, startMinute, endMinute, location, active: true }];
    });

    await run(async () => {
      await apiRequest("/worker/settings", {
        method: "PUT",
        body: JSON.stringify({
          location: workerLocation,
          appointmentDurationMinutes,
          bufferMinutes,
          bookingWindowDays: workerBookingWindowDays,
          minimumNoticeMinutes,
          windows,
        }),
      });
      await refreshSession();
    }, t("notices.availabilitySaved"));
  }

  async function updateAppointmentStatus(id: string, status: WorkerAppointmentStatusAction) {
    await run(async () => {
      await apiRequest(`/appointments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await refreshSession();
    }, t("notices.appointmentUpdated"));
  }

  function openBlockDialog(date = workerToday) {
    setBlockDate(date);
    setBlockStart("12:00");
    setBlockEnd("12:30");
    setBlockReason(t("worker.block.defaultReason"));
    setBlockDialogOpen(true);
    setError(null);
    setNotice(null);
  }

  function closeBlockDialog() {
    if (saving) return;
    setBlockDialogOpen(false);
  }

  async function createBlockTime(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = inputDateMinuteInTimeZone(blockDate, timeToMinute(blockStart), workerTimeZone);
    const endsAt = inputDateMinuteInTimeZone(blockDate, timeToMinute(blockEnd), workerTimeZone);
    await run(async () => {
      await apiRequest("/worker/time-off", {
        method: "POST",
        body: JSON.stringify({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          reason: blockReason,
        }),
      });
      setBlockDialogOpen(false);
      await loadWorkerSettings();
    }, t("notices.timeBlocked"));
  }

  async function deleteTimeOff(id: string) {
    await run(async () => {
      await apiRequest(`/worker/time-off/${id}`, { method: "DELETE" });
      await loadWorkerSettings();
    }, t("notices.timeBlockRemoved"));
  }

  function updateAdminUserForm(patch: Partial<AdminUserForm>) {
    setAdminUserForm((current) => ({ ...current, ...patch }));
  }

  function updateAdminServiceForm(patch: Partial<AdminServiceForm>) {
    setAdminServiceForm((current) => ({ ...current, ...patch }));
  }

  function openCreateAdminUserDrawer() {
    setAdminUserForm({
      active: true,
      email: "",
      name: "",
      phone: "",
      preferredLocale: locale,
      role: "WORKER",
      workerLocation: "Main clinic",
    });
    setAdminDrawer({ mode: "create", type: "user" });
    setError(null);
    setNotice(null);
  }

  function openEditAdminUserDrawer(adminUser: User) {
    setAdminUserForm({
      active: adminUser.active,
      email: adminUser.email,
      name: adminUser.name,
      phone: adminUser.phone ?? "",
      preferredLocale: adminUser.preferredLocale,
      role: adminUser.role,
      workerLocation: adminUser.workerProfile?.location ?? "",
    });
    setAdminDrawer({ mode: "edit", type: "user", userId: adminUser.id });
    setError(null);
    setNotice(null);
  }

  function openCreateServiceDrawer() {
    setAdminServiceForm({
      active: true,
      descriptionEn: "",
      descriptionFi: "",
      nameEn: "",
      nameFi: "",
    });
    setAdminDrawer({ mode: "create", type: "service" });
    setError(null);
    setNotice(null);
  }

  function openEditServiceDrawer(service: Service) {
    setAdminServiceForm({
      active: service.active,
      descriptionEn: service.description.en ?? "",
      descriptionFi: service.description.fi ?? "",
      nameEn: service.name.en ?? "",
      nameFi: service.name.fi ?? "",
    });
    setAdminDrawer({ mode: "edit", type: "service", serviceId: service.id });
    setError(null);
    setNotice(null);
  }

  function closeAdminDrawer() {
    if (saving) return;
    setAdminDrawer(null);
  }

  async function submitAdminUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      async () => {
        if (adminDrawer?.type === "user" && adminDrawer.mode === "edit" && adminDrawer.userId) {
          await apiRequest(`/admin/users/${adminDrawer.userId}`, {
            method: "PATCH",
            body: JSON.stringify({
              active: adminUserForm.active,
              name: adminUserForm.name,
              phone: adminUserForm.phone.trim() ? adminUserForm.phone.trim() : null,
              preferredLocale: adminUserForm.preferredLocale,
            }),
          });
          const catalogWorkers = await loadCatalog();
          await loadAdminData(catalogWorkers);
          setAdminDrawer(null);
          return;
        }

        await apiRequest("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email: adminUserForm.email,
            name: adminUserForm.name,
            role: adminUserForm.role,
            password: "ChangeMe123!",
            phone: adminUserForm.phone.trim() || undefined,
            preferredLocale: adminUserForm.preferredLocale,
            worker:
              adminUserForm.role === "WORKER"
                ? {
                    location: adminUserForm.workerLocation,
                  }
                : undefined,
          }),
        });
        const catalogWorkers = await loadCatalog();
        await loadAdminData(catalogWorkers);
        setAdminDrawer(null);
      },
      adminDrawer?.mode === "edit" ? t("notices.userUpdated") : t("notices.userCreated"),
    );
  }

  async function updateAdminUserActive(adminUser: User, active: boolean) {
    await run(
      async () => {
        await apiRequest(`/admin/users/${adminUser.id}`, {
          method: "PATCH",
          body: JSON.stringify({ active }),
        });
        const catalogWorkers = await loadCatalog();
        await loadAdminData(catalogWorkers);
      },
      active ? t("notices.userEnabled") : t("notices.userDisabled"),
    );
  }

  async function submitAdminService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(
      async () => {
        const body = JSON.stringify({
          active: adminServiceForm.active,
          descriptionEn: adminServiceForm.descriptionEn.trim()
            ? adminServiceForm.descriptionEn.trim()
            : null,
          descriptionFi: adminServiceForm.descriptionFi.trim()
            ? adminServiceForm.descriptionFi.trim()
            : null,
          nameEn: adminServiceForm.nameEn,
          nameFi: adminServiceForm.nameFi,
        });

        if (
          adminDrawer?.type === "service" &&
          adminDrawer.mode === "edit" &&
          adminDrawer.serviceId
        ) {
          await apiRequest(`/admin/services/${adminDrawer.serviceId}`, {
            method: "PATCH",
            body,
          });
        } else {
          await apiRequest("/admin/services", {
            method: "POST",
            body,
          });
        }

        const catalogWorkers = await loadCatalog();
        await loadAdminData(catalogWorkers);
        setAdminDrawer(null);
      },
      adminDrawer?.mode === "edit" ? t("notices.serviceUpdated") : t("notices.serviceCreated"),
    );
  }

  async function updateAdminServiceActive(service: Service, active: boolean) {
    await run(
      async () => {
        await apiRequest(`/admin/services/${service.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            active,
            nameEn: service.name.en ?? service.id,
            nameFi: service.name.fi ?? service.name.en ?? service.id,
          }),
        });
        const catalogWorkers = await loadCatalog();
        await loadAdminData(catalogWorkers);
      },
      active ? t("notices.serviceEnabled") : t("notices.serviceDisabled"),
    );
  }

  function renderAppointmentCard(appointment: Appointment, history = false) {
    const showActions = !history && appointment.status === "CONFIRMED";

    return (
      <div
        className={[
          "surface flex flex-col gap-4 border-l-4 p-4 focus:outline-none focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-amber-500 md:flex-row md:items-center md:justify-between",
          history ? "border-l-slate-300 opacity-70" : "border-l-teal-600",
        ].join(" ")}
        data-testid={`appointment-card-${appointment.id}`}
        key={appointment.id}
        ref={setAppointmentCardRef(appointment.id)}
        tabIndex={-1}
      >
        <div className="min-w-0">
          <p className="text-lg font-bold">
            {formatDateTime(appointment.startsAt, locale, appointment.worker.timezone)}
          </p>
          <p className="muted mt-1 text-sm">
            {serviceName(appointment.service, locale)} · {appointment.worker.name} ·{" "}
            {appointmentLocation(appointment)}
          </p>
          {user?.role !== "PATIENT" ? (
            <p className="muted mt-1 text-sm">{appointment.patient.name}</p>
          ) : null}
          <span
            className={[
              "mt-3 inline-flex rounded-md border px-3 py-1 text-sm font-semibold",
              appointmentStatusClass(appointment.status),
            ].join(" ")}
          >
            {appointmentStatusLabel(appointment.status)}
          </span>
        </div>

        {showActions ? (
          <div className="flex flex-wrap gap-2 md:justify-end">
            <button
              className="btn-secondary"
              disabled={saving}
              onClick={() => startReschedule(appointment)}
              type="button"
            >
              {t("appointments.reschedule")}
            </button>
            <button
              className="btn-secondary"
              disabled={saving}
              onClick={() => openCancelAppointmentConfirmation(appointment)}
              type="button"
            >
              {t("appointments.cancel")}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function workerAppointmentLocation(appointment: Appointment) {
    return appointmentLocation(appointment);
  }

  function isCurrentAppointment(appointment: Appointment) {
    const now = Date.now();
    return (
      appointment.status === "CONFIRMED" &&
      new Date(appointment.startsAt).getTime() <= now &&
      new Date(appointment.endsAt).getTime() >= now
    );
  }

  function canUpdateAppointmentStatus(appointment: Appointment) {
    return (
      appointment.status === "CONFIRMED" && new Date(appointment.startsAt).getTime() <= Date.now()
    );
  }

  function renderWorkerAppointmentEvent(appointment: Appointment, compact = false) {
    const current = isCurrentAppointment(appointment);
    const showActions = appointment.status === "CONFIRMED" && !compact;
    const showStatusActions = canUpdateAppointmentStatus(appointment);

    return (
      <article
        className={[
          "min-w-0 overflow-hidden rounded-md border bg-white p-3",
          compact ? "text-sm" : "",
          current ? "border-l-4 border-l-teal-600 bg-teal-50" : "border-[var(--line)]",
          appointment.status === "CANCELED" ? "opacity-65" : "",
        ].join(" ")}
        data-testid={`worker-appointment-${appointment.id}`}
        key={appointment.id}
      >
        <div
          className={
            compact
              ? "grid min-w-0 gap-2"
              : "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
          }
        >
          <div className="min-w-0">
            {compact ? (
              <p className="min-w-0 font-bold leading-snug">
                <span className="block whitespace-nowrap">
                  {formatTime(appointment.startsAt, locale, workerTimeZone)}
                </span>
                <span className="block break-words">{appointment.patient.name}</span>
              </p>
            ) : (
              <p className="break-words font-bold">
                {formatTime(appointment.startsAt, locale, workerTimeZone)} ·{" "}
                {appointment.patient.name}
              </p>
            )}
            <p className="muted mt-1 break-words text-sm leading-snug">
              {serviceName(appointment.service, locale)} · {workerAppointmentLocation(appointment)}
            </p>
            <p className="muted mt-1 break-words text-sm leading-snug">
              {appointment.patient.phone ?? appointment.patient.email}
              {appointment.patient.phone ? ` · ${appointment.patient.email}` : ""}
            </p>
          </div>
          <span
            className={[
              "inline-flex max-w-full rounded-md border font-semibold leading-tight",
              compact
                ? "w-fit whitespace-normal px-2 py-1 text-xs"
                : "w-fit shrink-0 px-3 py-1 text-sm",
              appointmentStatusClass(appointment.status),
            ].join(" ")}
          >
            {current ? t("worker.now") : appointmentStatusLabel(appointment.status)}
          </span>
        </div>

        {showActions ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {showStatusActions ? (
              <>
                <button
                  className="btn-primary flex items-center gap-2"
                  disabled={saving}
                  onClick={() => openAppointmentStatusConfirmation(appointment, "COMPLETED")}
                  type="button"
                >
                  <Check aria-hidden="true" size={16} />
                  {t("worker.actions.markDone")}
                </button>
                <button
                  className="btn-secondary"
                  disabled={saving}
                  onClick={() => openAppointmentStatusConfirmation(appointment, "NO_SHOW")}
                  type="button"
                >
                  {t("worker.actions.noShow")}
                </button>
              </>
            ) : null}
            <button
              className="btn-secondary"
              disabled={saving}
              onClick={() => openCancelAppointmentConfirmation(appointment)}
              type="button"
            >
              {t("appointments.cancel")}
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  function timeOffForDate(date: string) {
    return workerTimeOff.filter((entry) => {
      const startKey = formatDateKey(entry.startsAt, workerTimeZone);
      const endKey = formatDateKey(entry.endsAt, workerTimeZone);
      return startKey <= date && endKey >= date;
    });
  }

  function workerDaySlotCount(day: WorkerDayForm) {
    if (!day.active) return t("worker.off");
    const startMinute = timeToMinute(day.start);
    const endMinute = timeToMinute(day.end);
    const breakStartMinute = timeToMinute(day.breakStart ?? "");
    const breakEndMinute = timeToMinute(day.breakEnd ?? "");
    const step = ceilToSlotStep(appointmentDurationMinutes + bufferMinutes);
    const countWindow = (start: number, end: number) =>
      end - start >= appointmentDurationMinutes
        ? Math.floor((end - start - appointmentDurationMinutes) / step) + 1
        : 0;

    if (
      breakEndMinute > breakStartMinute &&
      breakStartMinute > startMinute &&
      breakEndMinute < endMinute
    ) {
      return t("worker.slotCount", {
        count: countWindow(startMinute, breakStartMinute) + countWindow(breakEndMinute, endMinute),
      });
    }

    return t("worker.slotCount", { count: countWindow(startMinute, endMinute) });
  }

  function updateWorkerDay(weekday: number, patch: Partial<WorkerDayForm>) {
    setWorkerDays((current) =>
      current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)),
    );
  }

  function updateWorkerBreakStart(value: string) {
    setWorkerBreakStart(value);
    setWorkerDays((current) =>
      current.map((day) =>
        day.active ? { ...day, breakStart: value, breakEnd: day.breakEnd ?? workerBreakEnd } : day,
      ),
    );
  }

  function updateWorkerBreakEnd(value: string) {
    setWorkerBreakEnd(value);
    setWorkerDays((current) =>
      current.map((day) =>
        day.active
          ? { ...day, breakStart: day.breakStart ?? workerBreakStart, breakEnd: value }
          : day,
      ),
    );
  }

  function clearWorkerBreaks() {
    setWorkerBreakStart("");
    setWorkerBreakEnd("");
    setWorkerDays((current) =>
      current.map((day) => ({
        weekday: day.weekday,
        active: day.active,
        start: day.start,
        end: day.end,
        location: day.location,
      })),
    );
  }

  function updateWorkerLocation(nextLocation: string) {
    setWorkerDays((current) =>
      current.map((day) =>
        day.location === workerLocation ? { ...day, location: nextLocation } : day,
      ),
    );
    setWorkerLocation(nextLocation);
  }

  function renderBookingPanel({
    id,
    labelledBy,
    readOnly = false,
    subtitle = t("booking.subtitle"),
    title = t("booking.title"),
  }: {
    id: string;
    labelledBy: string;
    readOnly?: boolean;
    subtitle?: string;
    title?: string;
  }) {
    return (
      <div aria-labelledby={labelledBy} className="p-5" id={id} role="tabpanel">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              <CalendarClock aria-hidden="true" size={22} />
              {title}
            </h2>
            <p className="muted text-sm">{subtitle}</p>
          </div>
          <button className="btn-secondary" onClick={loadSlots} disabled={saving} type="button">
            {t("booking.refreshSlots")}
          </button>
        </div>

        {!readOnly && reschedulingAppointment ? (
          <div className="mt-5 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">{t("booking.rescheduling")}</p>
              <p className="text-sm">
                {appointmentFormatter(reschedulingAppointment)} ·{" "}
                {appointmentLocation(reschedulingAppointment)}
              </p>
            </div>
            <button className="btn-secondary" onClick={cancelReschedule} type="button">
              {t("booking.cancelReschedule")}
            </button>
          </div>
        ) : null}

        <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
          <label className="field min-w-0">
            <span>{t("fields.worker")}</span>
            <select
              disabled={!readOnly && Boolean(reschedulingAppointment)}
              value={selectedWorkerId}
              onChange={(event) => {
                const worker = workers.find((item) => item.id === event.target.value);
                setSelectedWorkerId(event.target.value);
                setSelectedServiceId(defaultServiceIdForWorker(worker, services));
              }}
            >
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name} · {worker.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field min-w-0">
            <span>{t("fields.service")}</span>
            <select
              disabled={
                !selectableServices.length || (!readOnly && Boolean(reschedulingAppointment))
              }
              value={selectedServiceId}
              onChange={(event) => setSelectedServiceId(event.target.value)}
            >
              {selectableServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {serviceName(service, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 min-w-0">
          <p className="muted text-sm font-semibold">{t("booking.selectDate")}</p>
          <div
            aria-label={t("booking.selectDate")}
            className="mt-3 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2"
            tabIndex={0}
          >
            {dateStripDays.map((date) => {
              const counts = slotCountsByDate.get(date) ?? { available: 0, total: 0 };
              const selected = selectedDate === date;
              const unavailable = counts.total === 0;
              const limited = counts.available > 0 && counts.available <= 2;
              const full = counts.available >= 3;
              const weekend = isWeekend(date);
              const disabled = unavailable;
              return (
                <button
                  aria-label={fullDateLabel(date, locale)}
                  aria-pressed={selected}
                  className={[
                    "grid min-h-24 w-[5.25rem] shrink-0 gap-1 rounded-md border p-2 text-center transition sm:w-24 sm:p-3",
                    selected
                      ? "border-teal-700 bg-teal-50 text-teal-950"
                      : "border-[var(--line)] bg-white text-[var(--foreground)]",
                    disabled || weekend ? "opacity-50" : "",
                  ].join(" ")}
                  data-testid={`strip-date-${date}`}
                  disabled={disabled}
                  key={date}
                  onClick={() => selectStripDate(date)}
                  type="button"
                >
                  <span className="text-xs font-bold uppercase">{weekdayLabel(date, locale)}</span>
                  <span className="text-2xl font-bold">{dayNumber(date)}</span>
                  <span
                    aria-label={
                      full
                        ? t("booking.availabilityFull")
                        : limited
                          ? t("booking.availabilityLimited")
                          : t("booking.availabilityUnavailable")
                    }
                    className={[
                      "mx-auto h-2.5 w-2.5 rounded-full",
                      full ? "bg-teal-600" : limited ? "bg-amber-500" : "bg-slate-400",
                    ].join(" ")}
                  />
                  {limited ? (
                    <span className="text-xs font-semibold text-amber-800">
                      {t("booking.left", { count: counts.available })}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <DatePickerCalendar
            bookingMaxDate={bookingMaxDate}
            bookingMinDate={bookingMinDate}
            calendarMonth={calendarMonth}
            locale={locale}
            selectCalendarDate={selectCalendarDate}
            selectedDate={selectedDate}
            setCalendarMonth={setCalendarMonth}
            slotCountsByDate={slotCountsByDate}
          />

          <div className="grid min-w-0 gap-5">
            {slotsForSelectedDate.length ? (
              <>
                {morningSlots.length ? (
                  <SlotGroup
                    actionLabel={slotActionLabel}
                    locale={locale}
                    readOnly={readOnly}
                    requestBooking={requestBooking}
                    saving={saving}
                    slots={morningSlots}
                    timeZone={selectedWorker?.timezone}
                    title={t("booking.morning")}
                    user={user}
                    userCanBook={slotUserCanBook}
                  />
                ) : null}
                {afternoonSlots.length ? (
                  <SlotGroup
                    actionLabel={slotActionLabel}
                    locale={locale}
                    readOnly={readOnly}
                    requestBooking={requestBooking}
                    saving={saving}
                    slots={afternoonSlots}
                    timeZone={selectedWorker?.timezone}
                    title={t("booking.afternoon")}
                    user={user}
                    userCanBook={slotUserCanBook}
                  />
                ) : null}
              </>
            ) : (
              <p className="muted text-sm">{t("booking.noSlotsForDate")}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderWorkerWorkspace() {
    return (
      <section className="surface min-w-0 overflow-hidden">
        <div
          aria-label={t("worker.tabsLabel")}
          className="grid border-b border-[var(--line)] sm:grid-cols-3"
          role="tablist"
        >
          {(
            [
              ["agenda", CalendarClock, t("worker.tabs.agenda"), todayAgendaAppointments.length],
              ["week", CalendarDays, t("worker.tabs.week"), null],
              ["schedule", Settings, t("worker.tabs.schedule"), null],
            ] as const
          ).map(([tab, Icon, label, badge]) => (
            <button
              aria-controls={`worker-${tab}-panel`}
              aria-selected={workerTab === tab}
              className={[
                "flex min-h-14 items-center justify-center gap-2 border-b border-[var(--line)] px-4 py-3 text-center font-bold transition sm:border-b-0 sm:border-r last:sm:border-r-0",
                workerTab === tab
                  ? "bg-teal-50 text-teal-950"
                  : "bg-white text-[var(--foreground)] hover:bg-slate-50",
              ].join(" ")}
              id={`worker-${tab}-tab`}
              key={tab}
              onClick={() => setWorkerTab(tab)}
              role="tab"
              tabIndex={workerTab === tab ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" size={18} />
              {label}
              {badge !== null ? (
                <span className="inline-flex min-w-7 justify-center rounded-full bg-teal-100 px-2 py-0.5 text-sm font-bold text-teal-900">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {workerTab === "agenda" ? (
          <div
            aria-labelledby="worker-agenda-tab"
            className="grid gap-5 p-5"
            id="worker-agenda-panel"
            role="tabpanel"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">{t("worker.agenda.title")}</h2>
                <p className="muted text-sm">
                  {fullDateLabel(workerToday, locale)} · {workerLocation}
                </p>
              </div>
              <button
                className="btn-secondary flex items-center justify-center gap-2"
                onClick={() => openBlockDialog(workerToday)}
                type="button"
              >
                <Plus aria-hidden="true" size={18} />
                {t("worker.block.add")}
              </button>
            </div>

            <div className="grid gap-3">
              {todayAgendaAppointments.length ? (
                todayAgendaAppointments.map((appointment) =>
                  renderWorkerAppointmentEvent(appointment),
                )
              ) : (
                <p className="muted text-sm">{t("worker.agenda.empty")}</p>
              )}
              {timeOffForDate(workerToday).map((entry) => (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950"
                  key={entry.id}
                >
                  <p className="font-bold">
                    {formatTime(entry.startsAt, locale, workerTimeZone)} -{" "}
                    {formatTime(entry.endsAt, locale, workerTimeZone)}
                  </p>
                  <p className="text-sm">{entry.reason ?? t("worker.block.blocked")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {workerTab === "week" ? (
          <div
            aria-labelledby="worker-week-tab"
            className="grid gap-5 p-5"
            id="worker-week-panel"
            role="tabpanel"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">{t("worker.week.title")}</h2>
                <p className="muted text-sm">
                  {fullDateLabel(workerWeekStart, locale)} - {fullDateLabel(workerWeekEnd, locale)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  aria-label={t("worker.week.previous")}
                  className="btn-secondary"
                  onClick={() => setWorkerWeekStart(addDays(workerWeekStart, -7))}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" size={18} />
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setWorkerWeekStart(weekStartMonday(workerToday))}
                  type="button"
                >
                  {t("worker.week.today")}
                </button>
                <button
                  aria-label={t("worker.week.next")}
                  className="btn-secondary"
                  onClick={() => setWorkerWeekStart(addDays(workerWeekStart, 7))}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
                <button
                  className="btn-primary flex items-center gap-2"
                  onClick={() => openBlockDialog(workerToday)}
                  type="button"
                >
                  <Plus aria-hidden="true" size={18} />
                  {t("worker.block.add")}
                </button>
              </div>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
              {workerWeekDays.map((date) => {
                const dayAppointments = weekAppointments
                  .filter(
                    (appointment) => formatDateKey(appointment.startsAt, workerTimeZone) === date,
                  )
                  .sort(
                    (left, right) =>
                      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
                  );
                const dayBlocks = timeOffForDate(date);

                return (
                  <section
                    className="min-w-0 overflow-hidden rounded-md border border-[var(--line)] p-3"
                    key={date}
                  >
                    <div className="grid min-w-0 gap-2">
                      <div>
                        <h3 className="font-bold">{weekdayLabel(date, locale)}</h3>
                        <p className="muted text-sm">{dayNumber(date)}</p>
                      </div>
                      <button
                        aria-label={t("worker.block.addForDate", {
                          date: fullDateLabel(date, locale),
                        })}
                        className="inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1.5 rounded-md border border-[var(--line)] bg-white px-2 py-1.5 text-center text-sm font-semibold leading-tight text-[var(--foreground)] transition hover:border-teal-600 hover:bg-teal-50"
                        onClick={() => openBlockDialog(date)}
                        title={t("worker.block.addForDate", {
                          date: fullDateLabel(date, locale),
                        })}
                        type="button"
                      >
                        <Plus aria-hidden="true" className="shrink-0" size={16} />
                        <span className="min-w-0 break-words">{t("worker.block.addShort")}</span>
                      </button>
                    </div>

                    <div className="mt-3 grid min-w-0 gap-2">
                      {dayAppointments.map((appointment) =>
                        renderWorkerAppointmentEvent(appointment, true),
                      )}
                      {dayBlocks.map((entry) => (
                        <div
                          className="min-w-0 overflow-hidden rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                          key={entry.id}
                        >
                          <p className="break-words font-bold">
                            {formatTime(entry.startsAt, locale, workerTimeZone)} -{" "}
                            {formatTime(entry.endsAt, locale, workerTimeZone)}
                          </p>
                          <p className="break-words">{entry.reason ?? t("worker.block.blocked")}</p>
                        </div>
                      ))}
                      {!dayAppointments.length && !dayBlocks.length ? (
                        <p className="muted text-sm">{t("worker.week.emptyDay")}</p>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : null}

        {workerTab === "schedule" ? (
          <div
            aria-labelledby="worker-schedule-tab"
            className="grid gap-5 p-5"
            id="worker-schedule-panel"
            role="tabpanel"
          >
            <div>
              <h2 className="text-xl font-bold">{t("worker.schedule.title")}</h2>
              <p className="muted text-sm">{t("worker.schedule.subtitle")}</p>
            </div>

            <form className="grid min-w-0 gap-6" onSubmit={saveAvailability}>
              <label className="field min-w-0">
                <span>{t("fields.location")}</span>
                <input
                  value={workerLocation}
                  onChange={(event) => updateWorkerLocation(event.target.value)}
                  required
                />
              </label>

              <fieldset className="grid min-w-0 gap-3">
                <legend className="text-sm font-bold uppercase text-[var(--muted)]">
                  {t("worker.schedule.workingHours")}
                </legend>
                <div className="grid min-w-0 gap-3">
                  {workerDays.map((day) => (
                    <div
                      className="grid min-w-0 gap-3 rounded-md border border-[var(--line)] p-3 xl:grid-cols-[4.5rem_6rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_6rem] xl:items-center"
                      key={day.weekday}
                    >
                      <span className={day.active ? "font-bold" : "muted font-bold"}>
                        {t(`weekdays.${day.weekday}`)}
                      </span>
                      <label className="flex min-w-0 items-center gap-2">
                        <input
                          checked={day.active}
                          onChange={(event) =>
                            updateWorkerDay(day.weekday, { active: event.target.checked })
                          }
                          type="checkbox"
                        />
                        {day.active ? t("worker.on") : t("worker.off")}
                      </label>
                      <label className="field min-w-0">
                        <span>{t("worker.start")}</span>
                        <input
                          disabled={!day.active}
                          onChange={(event) =>
                            updateWorkerDay(day.weekday, { start: event.target.value })
                          }
                          step={900}
                          type="time"
                          value={day.start}
                        />
                      </label>
                      <label className="field min-w-0">
                        <span>{t("worker.end")}</span>
                        <input
                          disabled={!day.active}
                          onChange={(event) =>
                            updateWorkerDay(day.weekday, { end: event.target.value })
                          }
                          step={900}
                          type="time"
                          value={day.end}
                        />
                      </label>
                      <label className="field min-w-0">
                        <span>{t("fields.location")}</span>
                        <input
                          disabled={!day.active}
                          onChange={(event) =>
                            updateWorkerDay(day.weekday, { location: event.target.value })
                          }
                          value={day.location}
                        />
                      </label>
                      <span className="muted text-sm">{workerDaySlotCount(day)}</span>
                    </div>
                  ))}
                </div>
              </fieldset>

              <fieldset className="grid min-w-0 gap-3">
                <legend className="text-sm font-bold uppercase text-[var(--muted)]">
                  {t("worker.schedule.breaks")}
                </legend>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="field min-w-0">
                    <span>{t("worker.block.from")}</span>
                    <input
                      onChange={(event) => updateWorkerBreakStart(event.target.value)}
                      step={900}
                      type="time"
                      value={workerBreakStart}
                    />
                  </label>
                  <label className="field min-w-0">
                    <span>{t("worker.block.to")}</span>
                    <input
                      onChange={(event) => updateWorkerBreakEnd(event.target.value)}
                      step={900}
                      type="time"
                      value={workerBreakEnd}
                    />
                  </label>
                  <button
                    aria-label={t("worker.block.clear")}
                    className="btn-secondary flex items-center justify-center"
                    onClick={clearWorkerBreaks}
                    type="button"
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </div>
              </fieldset>

              <fieldset className="grid min-w-0 gap-3">
                <legend className="text-sm font-bold uppercase text-[var(--muted)]">
                  {t("worker.schedule.slotSettings")}
                </legend>
                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <label className="field min-w-0">
                    <span>{t("worker.schedule.duration")}</span>
                    <select
                      onChange={(event) =>
                        setAppointmentDurationMinutes(Number(event.target.value))
                      }
                      value={appointmentDurationMinutes}
                    >
                      {[15, 30, 45, 60].map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {t("worker.minutes", { count: minutes })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field min-w-0">
                    <span>{t("worker.schedule.buffer")}</span>
                    <select
                      onChange={(event) => setBufferMinutes(Number(event.target.value))}
                      value={bufferMinutes}
                    >
                      {[0, 5, 10, 15, 30].map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {t("worker.minutes", { count: minutes })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field min-w-0">
                    <span>{t("worker.schedule.bookingWindow")}</span>
                    <input
                      max={90}
                      min={1}
                      onChange={(event) => setWorkerBookingWindowDays(Number(event.target.value))}
                      type="number"
                      value={workerBookingWindowDays}
                    />
                  </label>
                  <label className="field min-w-0">
                    <span>{t("worker.schedule.minimumNotice")}</span>
                    <select
                      onChange={(event) => setMinimumNoticeMinutes(Number(event.target.value))}
                      value={minimumNoticeMinutes}
                    >
                      {[0, 60, 120, 240, 1440].map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes >= 1440
                            ? t("worker.days", { count: minutes / 1440 })
                            : t("worker.hours", { count: minutes / 60 })}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>

              <section className="grid min-w-0 gap-3">
                <h3 className="text-sm font-bold uppercase text-[var(--muted)]">
                  {t("worker.timeOff.title")}
                </h3>
                {upcomingTimeOff.length ? (
                  <div className="grid min-w-0 gap-2">
                    {upcomingTimeOff.map((entry) => (
                      <div
                        className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--line)] p-3 sm:flex-row sm:items-center sm:justify-between"
                        key={entry.id}
                      >
                        <div className="min-w-0">
                          <p className="break-words font-bold">
                            {entry.reason ?? t("worker.block.blocked")}
                          </p>
                          <p className="muted break-words text-sm">
                            {formatDateTime(entry.startsAt, locale, workerTimeZone)} -{" "}
                            {formatDateTime(entry.endsAt, locale, workerTimeZone)}
                          </p>
                        </div>
                        <button
                          aria-label={t("worker.timeOff.remove")}
                          className="btn-secondary flex shrink-0 items-center justify-center gap-2"
                          disabled={saving}
                          onClick={() => openDeleteTimeOffConfirmation(entry)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={16} />
                          {t("worker.timeOff.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted text-sm">{t("worker.timeOff.empty")}</p>
                )}
              </section>

              <button className="btn-primary" disabled={saving} type="submit">
                {t("worker.saveAvailability")}
              </button>
            </form>
          </div>
        ) : null}
      </section>
    );
  }

  function adminUserIsActive(adminUser: User) {
    return adminUser.active && (adminUser.workerProfile?.active ?? true);
  }

  function adminUserLocation(adminUser: User) {
    if (adminUser.role === "ADMIN") return t("admin.users.allClinics");
    if (adminUser.role === "WORKER") return adminUser.workerProfile?.location ?? t("admin.empty");
    return t("admin.empty");
  }

  function adminUserInitials(adminUser: User) {
    const words = adminUser.name.trim().split(/\s+/).filter(Boolean);
    const initials = words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("");
    return initials || adminUser.email.charAt(0).toUpperCase();
  }

  function renderAdminStatusChip(active: boolean) {
    return (
      <span
        className={[
          "inline-flex w-fit rounded-md border px-3 py-1 text-sm font-semibold",
          active
            ? "border-teal-200 bg-teal-50 text-teal-800"
            : "border-red-200 bg-red-50 text-red-800",
        ].join(" ")}
      >
        {active ? t("admin.status.active") : t("admin.status.inactive")}
      </span>
    );
  }

  function adminServiceMetadata(service: Service) {
    const serviceWorkers = workers.filter((worker) =>
      worker.services.some((workerService) => workerService.id === service.id),
    );
    const durations = Array.from(
      new Set(serviceWorkers.map((worker) => worker.appointmentDurationMinutes)),
    ).sort((left, right) => left - right);
    const locations = Array.from(new Set(serviceWorkers.map((worker) => worker.location))).sort();

    return {
      durations:
        durations.length > 0
          ? durations
              .map((duration) => t("admin.services.duration", { count: duration }))
              .join(", ")
          : t("admin.services.noWorkers"),
      locations: locations.length > 0 ? locations.join(", ") : t("admin.services.noLocations"),
    };
  }

  function renderAdminOverview() {
    const activeWorkerCount = workers.filter((worker) => worker.active).length;
    const cards = [
      {
        label: t("admin.overview.appointmentsToday"),
        value: adminTodayAppointments.length,
        detail: fullDateLabel(adminToday, locale),
      },
      {
        label: t("admin.overview.availableSlotsToday"),
        value: adminAvailableSlotsToday,
        detail: t("admin.overview.acrossWorkers", { count: activeWorkerCount }),
      },
      {
        label: t("admin.overview.totalUsers"),
        value: adminUsers.length,
        detail: t("admin.overview.userBreakdown", {
          patients: adminPatientCount,
          workers: adminWorkerCount,
        }),
      },
      {
        label: t("admin.overview.cancellationsThisWeek"),
        value: adminCancellationsThisWeek,
        detail: t("admin.overview.thisWeek"),
      },
    ];

    return (
      <div
        aria-labelledby="admin-overview-tab"
        className="grid gap-5 p-5"
        id="admin-overview-panel"
        role="tabpanel"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <section
              className="rounded-md border border-[var(--line)] bg-white p-4"
              key={card.label}
            >
              <p className="muted text-sm font-semibold">{card.label}</p>
              <p className="mt-2 text-4xl font-bold">{card.value}</p>
              <p className="muted mt-2 text-sm">{card.detail}</p>
            </section>
          ))}
        </div>

        <section className="surface min-w-0 overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold">
              {t("admin.overview.todaySchedule", { date: fullDateLabel(adminToday, locale) })}
            </h2>
            <p className="muted text-sm">{t("admin.overview.allWorkers")}</p>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {adminTodayAppointments.length ? (
              adminTodayAppointments.map((appointment) => (
                <div
                  className="grid gap-3 p-4 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-center"
                  key={appointment.id}
                >
                  <p className="muted font-semibold">
                    {formatTime(appointment.startsAt, locale, appointment.worker.timezone)}
                  </p>
                  <div className="min-w-0">
                    <p className="break-words font-bold">
                      {appointment.patient.name} · {appointment.worker.name}
                    </p>
                    <p className="muted break-words text-sm">
                      {serviceName(appointment.service, locale)} ·{" "}
                      {appointmentLocation(appointment)}
                    </p>
                  </div>
                  <span
                    className={[
                      "inline-flex w-fit rounded-md border px-3 py-1 text-sm font-semibold",
                      appointmentStatusClass(appointment.status),
                    ].join(" ")}
                  >
                    {appointmentStatusLabel(appointment.status)}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted p-4 text-sm">{t("admin.overview.noAppointments")}</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderAdminUsers() {
    return (
      <div
        aria-labelledby="admin-users-tab"
        className="grid gap-5 p-5"
        id="admin-users-panel"
        role="tabpanel"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">{t("admin.users.title")}</h2>
            <p className="muted text-sm">{t("admin.users.subtitle")}</p>
          </div>
          <button
            className="btn-primary flex items-center justify-center gap-2"
            onClick={openCreateAdminUserDrawer}
            type="button"
          >
            <UserPlus aria-hidden="true" size={18} />
            {t("admin.users.add")}
          </button>
        </div>

        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <thead className="border-b border-[var(--line)] text-sm uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-bold">{t("admin.users.columns.name")}</th>
                <th className="px-4 py-3 font-bold">{t("admin.users.columns.email")}</th>
                <th className="px-4 py-3 font-bold">{t("admin.users.columns.role")}</th>
                <th className="px-4 py-3 font-bold">{t("admin.users.columns.location")}</th>
                <th className="px-4 py-3 font-bold">{t("admin.users.columns.status")}</th>
                <th className="px-4 py-3 text-right font-bold">
                  {t("admin.users.columns.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {adminUsers.map((adminUser) => {
                const active = adminUserIsActive(adminUser);
                const isCurrentUser = adminUser.id === user?.id;
                return (
                  <tr data-testid={`admin-user-row-${adminUser.id}`} key={adminUser.id}>
                    <td className="px-4 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-50 font-bold text-teal-800">
                          {adminUserInitials(adminUser)}
                        </span>
                        <span className="min-w-0 break-words font-bold">{adminUser.name}</span>
                      </div>
                    </td>
                    <td className="muted px-4 py-4">{adminUser.email}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-semibold">
                        {roleLabel(adminUser.role, t)}
                      </span>
                    </td>
                    <td className="muted px-4 py-4">{adminUserLocation(adminUser)}</td>
                    <td className="px-4 py-4">{renderAdminStatusChip(active)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          className="btn-secondary"
                          onClick={() => openEditAdminUserDrawer(adminUser)}
                          type="button"
                        >
                          {t("admin.actions.edit")}
                        </button>
                        <button
                          className="btn-secondary"
                          disabled={saving || isCurrentUser}
                          onClick={() => updateAdminUserActive(adminUser, !active)}
                          title={isCurrentUser ? t("admin.users.currentUser") : undefined}
                          type="button"
                        >
                          {active ? t("admin.actions.disable") : t("admin.actions.enable")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderAdminServices() {
    return (
      <div
        aria-labelledby="admin-services-tab"
        className="grid gap-5 p-5"
        id="admin-services-panel"
        role="tabpanel"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">{t("admin.services.title")}</h2>
            <p className="muted text-sm">{t("admin.services.subtitle")}</p>
          </div>
          <button
            className="btn-primary flex items-center justify-center gap-2"
            onClick={openCreateServiceDrawer}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            {t("admin.services.add")}
          </button>
        </div>

        <div className="surface divide-y divide-[var(--line)] overflow-hidden">
          {adminServices.length ? (
            adminServices.map((service) => {
              const metadata = adminServiceMetadata(service);
              return (
                <article
                  className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
                  data-testid={`admin-service-row-${service.id}`}
                  key={service.id}
                >
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-bold">
                      {serviceName(service, locale)}
                    </h3>
                    <p className="muted mt-1 break-words text-sm">
                      {metadata.durations} · {metadata.locations}
                    </p>
                  </div>
                  {renderAdminStatusChip(service.active)}
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      className="btn-secondary"
                      onClick={() => openEditServiceDrawer(service)}
                      type="button"
                    >
                      {t("admin.actions.edit")}
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={saving}
                      onClick={() => updateAdminServiceActive(service, !service.active)}
                      type="button"
                    >
                      {service.active ? t("admin.actions.disable") : t("admin.actions.enable")}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="muted p-4 text-sm">{t("admin.services.empty")}</p>
          )}
        </div>
      </div>
    );
  }

  function renderAdminWorkspace() {
    const tabs = [
      ["overview", Shield, t("admin.tabs.overview"), null],
      ["users", UserPlus, t("admin.tabs.users"), adminUsers.length],
      ["services", Settings, t("admin.tabs.services"), null],
      ["booking", CalendarClock, t("admin.tabs.booking"), null],
    ] as const;

    return (
      <section className="surface min-w-0 overflow-hidden">
        <div
          aria-label={t("admin.tabsLabel")}
          className="grid border-b border-[var(--line)] sm:grid-cols-4"
          role="tablist"
        >
          {tabs.map(([tab, Icon, label, badge]) => (
            <button
              aria-controls={`admin-${tab}-panel`}
              aria-selected={adminTab === tab}
              className={[
                "flex min-h-14 items-center justify-center gap-2 border-b border-[var(--line)] px-4 py-3 text-center font-bold transition sm:border-b-0 sm:border-r last:sm:border-r-0",
                adminTab === tab
                  ? "bg-teal-50 text-teal-950"
                  : "bg-white text-[var(--foreground)] hover:bg-slate-50",
              ].join(" ")}
              id={`admin-${tab}-tab`}
              key={tab}
              onClick={() => setAdminTab(tab)}
              role="tab"
              tabIndex={adminTab === tab ? 0 : -1}
              type="button"
            >
              <Icon aria-hidden="true" size={18} />
              {label}
              {badge !== null ? (
                <span className="inline-flex min-w-7 justify-center rounded-full bg-teal-100 px-2 py-0.5 text-sm font-bold text-teal-900">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {adminTab === "overview" ? renderAdminOverview() : null}
        {adminTab === "users" ? renderAdminUsers() : null}
        {adminTab === "services" ? renderAdminServices() : null}
        {adminTab === "booking"
          ? renderBookingPanel({
              id: "admin-booking-panel",
              labelledBy: "admin-booking-tab",
              readOnly: true,
              subtitle: t("admin.booking.subtitle"),
              title: t("admin.booking.title"),
            })
          : null}
      </section>
    );
  }

  function renderAdminDrawer() {
    if (!adminDrawer) return null;

    const editingUser =
      adminDrawer.type === "user" && adminDrawer.mode === "edit"
        ? adminUsers.find((adminUser) => adminUser.id === adminDrawer.userId)
        : null;
    const editingCurrentUser = Boolean(editingUser && editingUser.id === user?.id);
    const title =
      adminDrawer.type === "user"
        ? adminDrawer.mode === "edit"
          ? t("admin.users.edit")
          : t("admin.users.add")
        : adminDrawer.mode === "edit"
          ? t("admin.services.edit")
          : t("admin.services.add");

    return (
      <AppDialog
        backdropClassName="fixed inset-0 z-30 bg-slate-950/40"
        className="surface ml-auto flex h-full w-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden rounded-none border-y-0 border-r-0 shadow-xl"
        labelledBy="admin-drawer-title"
        onClose={closeAdminDrawer}
        testId="admin-drawer-backdrop"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-5">
          <div>
            <h2 className="text-xl font-bold" id="admin-drawer-title">
              {title}
            </h2>
            <p className="muted mt-1 text-sm">
              {adminDrawer.type === "user"
                ? t("admin.users.drawerSubtitle")
                : t("admin.services.drawerSubtitle")}
            </p>
          </div>
          <button
            aria-label={t("admin.drawer.close")}
            className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)]"
            disabled={saving}
            onClick={closeAdminDrawer}
            ref={adminDrawerCloseButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {adminDrawer.type === "user" ? (
          <form
            className="grid flex-1 content-start gap-4 overflow-auto p-5"
            onSubmit={submitAdminUser}
          >
            <label className="field">
              <span>{t("fields.name")}</span>
              <input
                onChange={(event) => updateAdminUserForm({ name: event.target.value })}
                required
                value={adminUserForm.name}
              />
            </label>
            <label className="field">
              <span>{t("fields.email")}</span>
              <input
                disabled={adminDrawer.mode === "edit"}
                onChange={(event) => updateAdminUserForm({ email: event.target.value })}
                required
                type="email"
                value={adminUserForm.email}
              />
            </label>
            <label className="field">
              <span>{t("fields.phone")}</span>
              <input
                onChange={(event) => updateAdminUserForm({ phone: event.target.value })}
                value={adminUserForm.phone}
              />
            </label>
            <label className="field">
              <span>{t("fields.role")}</span>
              <select
                disabled={adminDrawer.mode === "edit"}
                onChange={(event) => updateAdminUserForm({ role: event.target.value as Role })}
                value={adminUserForm.role}
              >
                <option value="PATIENT">{t("roles.patient")}</option>
                <option value="WORKER">{t("roles.worker")}</option>
                <option value="ADMIN">{t("roles.admin")}</option>
              </select>
            </label>
            <label className="field">
              <span>{t("fields.locale")}</span>
              <select
                onChange={(event) =>
                  updateAdminUserForm({ preferredLocale: event.target.value as Locale })
                }
                value={adminUserForm.preferredLocale}
              >
                <option value="en">English</option>
                <option value="fi">Suomi</option>
              </select>
            </label>
            {adminUserForm.role === "WORKER" ? (
              <label className="field">
                <span>{t("fields.location")}</span>
                <input
                  disabled={adminDrawer.mode === "edit"}
                  onChange={(event) => updateAdminUserForm({ workerLocation: event.target.value })}
                  required={adminDrawer.mode === "create"}
                  value={adminUserForm.workerLocation}
                />
              </label>
            ) : null}
            {adminDrawer.mode === "edit" ? (
              <label className="flex items-center gap-2 font-semibold">
                <input
                  checked={adminUserForm.active}
                  disabled={editingCurrentUser}
                  onChange={(event) => updateAdminUserForm({ active: event.target.checked })}
                  type="checkbox"
                />
                {t("admin.status.active")}
              </label>
            ) : null}
            {editingCurrentUser ? (
              <p className="muted text-sm">{t("admin.users.currentUser")}</p>
            ) : null}
            <button className="btn-primary" disabled={saving} type="submit">
              {adminDrawer.mode === "edit" ? t("admin.users.saveEdit") : t("admin.users.saveNew")}
            </button>
          </form>
        ) : (
          <form
            className="grid flex-1 content-start gap-4 overflow-auto p-5"
            onSubmit={submitAdminService}
          >
            <label className="field">
              <span>{t("admin.serviceNameEn")}</span>
              <input
                onChange={(event) => updateAdminServiceForm({ nameEn: event.target.value })}
                required
                value={adminServiceForm.nameEn}
              />
            </label>
            <label className="field">
              <span>{t("admin.serviceNameFi")}</span>
              <input
                onChange={(event) => updateAdminServiceForm({ nameFi: event.target.value })}
                required
                value={adminServiceForm.nameFi}
              />
            </label>
            <label className="field">
              <span>{t("admin.services.descriptionEn")}</span>
              <textarea
                onChange={(event) => updateAdminServiceForm({ descriptionEn: event.target.value })}
                rows={3}
                value={adminServiceForm.descriptionEn}
              />
            </label>
            <label className="field">
              <span>{t("admin.services.descriptionFi")}</span>
              <textarea
                onChange={(event) => updateAdminServiceForm({ descriptionFi: event.target.value })}
                rows={3}
                value={adminServiceForm.descriptionFi}
              />
            </label>
            <label className="flex items-center gap-2 font-semibold">
              <input
                checked={adminServiceForm.active}
                onChange={(event) => updateAdminServiceForm({ active: event.target.checked })}
                type="checkbox"
              />
              {t("admin.status.active")}
            </label>
            <button className="btn-primary" disabled={saving} type="submit">
              {adminDrawer.mode === "edit"
                ? t("admin.services.saveEdit")
                : t("admin.services.saveNew")}
            </button>
          </form>
        )}
      </AppDialog>
    );
  }

  function renderConfirmationDialog() {
    if (!pendingConfirmation) return null;

    const appointment =
      pendingConfirmation.type === "cancelAppointment" ||
      pendingConfirmation.type === "updateAppointmentStatus"
        ? pendingConfirmation.appointment
        : null;
    const timeOffEntry =
      pendingConfirmation.type === "deleteTimeOff" ? pendingConfirmation.entry : null;
    const isCancel = pendingConfirmation.type === "cancelAppointment";
    const isNoShow =
      pendingConfirmation.type === "updateAppointmentStatus" &&
      pendingConfirmation.status === "NO_SHOW";
    const title = isCancel
      ? t("confirmations.cancel.title")
      : pendingConfirmation.type === "deleteTimeOff"
        ? t("confirmations.block.title")
        : isNoShow
          ? t("confirmations.status.noShowTitle")
          : t("confirmations.status.completedTitle");
    const description = isCancel
      ? t("confirmations.cancel.description")
      : pendingConfirmation.type === "deleteTimeOff"
        ? t("confirmations.block.description")
        : isNoShow
          ? t("confirmations.status.noShowDescription")
          : t("confirmations.status.completedDescription");
    const cancelLabel = isCancel
      ? t("confirmations.cancel.keep")
      : pendingConfirmation.type === "deleteTimeOff"
        ? t("confirmations.block.keep")
        : t("confirmations.status.keep");
    const confirmLabel = isCancel
      ? t("confirmations.cancel.confirm")
      : pendingConfirmation.type === "deleteTimeOff"
        ? t("confirmations.block.confirm")
        : isNoShow
          ? t("confirmations.status.confirmNoShow")
          : t("confirmations.status.confirmCompleted");
    const destructive = isCancel || pendingConfirmation.type === "deleteTimeOff" || isNoShow;
    const showCancellationPolicy =
      isCancel &&
      user?.role === "PATIENT" &&
      appointment !== null &&
      appointmentStartsWithinHours(appointment, cancellationPolicyWarningHours);

    return (
      <AppDialog
        backdropClassName="fixed inset-0 z-40 grid items-end bg-slate-950/50 px-0 sm:place-items-center sm:px-4 sm:py-6"
        className="surface max-h-full w-full overflow-auto rounded-b-none p-5 shadow-xl sm:max-w-lg sm:rounded-md"
        describedBy="confirmation-dialog-description"
        labelledBy="confirmation-dialog-title"
        onClose={closeConfirmationDialog}
        testId="confirmation-dialog-backdrop"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold" id="confirmation-dialog-title">
              {title}
            </h2>
            <p className="muted mt-1 text-sm" id="confirmation-dialog-description">
              {description}
            </p>
          </div>
          <button
            aria-label={t("auth.close")}
            className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)]"
            disabled={saving}
            onClick={closeConfirmationDialog}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {appointment ? (
          <div className="mt-5 rounded-md border border-[var(--line)] bg-slate-50 p-4">
            <p className="font-bold">
              {formatDateTime(appointment.startsAt, locale, appointment.worker.timezone)}
            </p>
            <p className="muted mt-1 text-sm">
              {serviceName(appointment.service, locale)} · {appointment.worker.name} ·{" "}
              {appointmentLocation(appointment)}
            </p>
            {user?.role !== "PATIENT" ? (
              <p className="muted mt-1 text-sm">{appointment.patient.name}</p>
            ) : null}
          </div>
        ) : null}

        {timeOffEntry ? (
          <div className="mt-5 rounded-md border border-[var(--line)] bg-slate-50 p-4">
            <p className="font-bold">{timeOffEntry.reason ?? t("worker.block.blocked")}</p>
            <p className="muted mt-1 text-sm">
              {formatDateTime(timeOffEntry.startsAt, locale, workerTimeZone)} -{" "}
              {formatDateTime(timeOffEntry.endsAt, locale, workerTimeZone)}
            </p>
          </div>
        ) : null}

        {showCancellationPolicy ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            {t("confirmations.cancel.policyWarning")}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            className="btn-secondary"
            disabled={saving}
            onClick={closeConfirmationDialog}
            ref={confirmationCancelButtonRef}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={[
              "rounded-md px-4 py-3 font-bold text-white transition disabled:opacity-60",
              destructive ? "bg-red-700 hover:bg-red-800" : "bg-teal-700 hover:bg-teal-800",
            ].join(" ")}
            disabled={saving}
            onClick={confirmPendingAction}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </AppDialog>
    );
  }

  function errorMessage(code: string) {
    try {
      return t(`errors.${code}`);
    } catch {
      return code;
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-teal-700 text-white">
              <Stethoscope aria-hidden="true" size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-bold">{t("app.title")}</h1>
              <p className="muted text-sm">{t("app.subtitle")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label={t("language.label")} className="flex items-center gap-2">
              <Languages aria-hidden="true" size={20} />
              <a
                className="btn-secondary"
                aria-current={locale === "en" ? "page" : undefined}
                href="/en"
              >
                English
              </a>
              <a
                className="btn-secondary"
                aria-current={locale === "fi" ? "page" : undefined}
                href="/fi"
              >
                Suomi
              </a>
            </nav>

            {user ? (
              <div className="relative">
                <button
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="true"
                  className="btn-secondary flex items-center gap-2"
                  onClick={() => setProfileMenuOpen((current) => !current)}
                  type="button"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-teal-700 text-sm font-bold text-white">
                    {profileInitial}
                  </span>
                  <span className="max-w-36 truncate">{user.name}</span>
                  <ChevronDown aria-hidden="true" size={16} />
                </button>
                {profileMenuOpen ? (
                  <div className="surface absolute right-0 z-20 mt-2 w-72 p-4 shadow-lg">
                    <p className="text-xs font-bold uppercase text-teal-700">
                      {roleLabel(user.role, t)}
                    </p>
                    <p className="mt-1 font-bold">{user.name}</p>
                    <p className="muted break-words text-sm">{user.email}</p>
                    <button
                      className="btn-secondary mt-4 flex w-full items-center justify-center gap-2"
                      onClick={logout}
                      type="button"
                    >
                      <LogOut aria-hidden="true" size={18} />
                      {t("auth.logout")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => openAuthDialog("login")}
                type="button"
              >
                <UserCircle aria-hidden="true" size={18} />
                {t("auth.login")}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4" aria-live="polite">
          {hydrated ? (
            <>
              {error ? (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                  {errorMessage(error)}
                </p>
              ) : null}
              {notice ? (
                <p className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-900">
                  {notice}
                </p>
              ) : null}

              {upcomingAppointment ? (
                <button
                  className="flex w-full flex-col gap-3 rounded-md border border-teal-300 bg-teal-50 p-4 text-left text-teal-950 transition hover:border-teal-500 hover:bg-teal-100 sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => openAppointmentFromBanner(upcomingAppointment.id)}
                  type="button"
                >
                  <span className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-700 text-white">
                      <CheckCircle2 aria-hidden="true" size={22} />
                    </span>
                    <div>
                      <span className="font-bold">{t("appointments.next")}</span>
                      <p className="text-sm">
                        {appointmentFormatter(upcomingAppointment)} ·{" "}
                        {appointmentLocation(upcomingAppointment)}
                      </p>
                    </div>
                  </span>
                  <ChevronRight aria-hidden="true" className="shrink-0 text-teal-700" size={22} />
                </button>
              ) : null}

              {user?.role === "WORKER" ? (
                renderWorkerWorkspace()
              ) : user?.role === "ADMIN" ? (
                renderAdminWorkspace()
              ) : (
                <section className="surface min-w-0 overflow-hidden">
                  <div
                    aria-label={t("appointments.tabsLabel")}
                    className="grid border-b border-[var(--line)] sm:grid-cols-2"
                    onKeyDown={handleMainTabKeyDown}
                    role="tablist"
                  >
                    <button
                      aria-controls="booking-panel"
                      aria-selected={activeTab === "book"}
                      className={[
                        "flex min-h-14 items-center justify-center gap-2 border-b border-[var(--line)] px-4 py-3 text-center font-bold transition sm:border-b-0 sm:border-r",
                        activeTab === "book"
                          ? "bg-teal-50 text-teal-950"
                          : "bg-white text-[var(--foreground)] hover:bg-slate-50",
                      ].join(" ")}
                      id="booking-tab"
                      onClick={() => switchMainTab("book")}
                      ref={bookingTabRef}
                      role="tab"
                      tabIndex={activeTab === "book" ? 0 : -1}
                      type="button"
                    >
                      {t("booking.title")}
                    </button>
                    <button
                      aria-controls="appointments-panel"
                      aria-selected={activeTab === "appointments"}
                      className={[
                        "flex min-h-14 items-center justify-center gap-2 px-4 py-3 text-center font-bold transition",
                        activeTab === "appointments"
                          ? "bg-teal-50 text-teal-950"
                          : "bg-white text-[var(--foreground)] hover:bg-slate-50",
                      ].join(" ")}
                      id="appointments-tab"
                      onClick={() => switchMainTab("appointments")}
                      ref={appointmentsTabRef}
                      role="tab"
                      tabIndex={activeTab === "appointments" ? 0 : -1}
                      type="button"
                    >
                      {t("appointments.myAppointments")}
                      <span
                        aria-label={t("appointments.badgeLabel", { count: appointmentBadgeCount })}
                        className="inline-flex min-w-7 justify-center rounded-full bg-teal-100 px-2 py-0.5 text-sm font-bold text-teal-900"
                      >
                        {appointmentBadgeCount}
                      </span>
                    </button>
                  </div>

                  {activeTab === "book" ? (
                    <div
                      aria-labelledby="booking-tab"
                      className="p-5"
                      id="booking-panel"
                      role="tabpanel"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h2 className="flex items-center gap-2 text-xl font-bold">
                            <CalendarClock aria-hidden="true" size={22} />
                            {t("booking.title")}
                          </h2>
                          <p className="muted text-sm">{t("booking.subtitle")}</p>
                        </div>
                        <button className="btn-secondary" onClick={loadSlots} disabled={saving}>
                          {t("booking.refreshSlots")}
                        </button>
                      </div>

                      {reschedulingAppointment ? (
                        <div className="mt-5 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-bold">{t("booking.rescheduling")}</p>
                            <p className="text-sm">
                              {appointmentFormatter(reschedulingAppointment)} ·{" "}
                              {appointmentLocation(reschedulingAppointment)}
                            </p>
                          </div>
                          <button
                            className="btn-secondary"
                            onClick={cancelReschedule}
                            type="button"
                          >
                            {t("booking.cancelReschedule")}
                          </button>
                        </div>
                      ) : null}

                      <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
                        <label className="field min-w-0">
                          <span>{t("fields.worker")}</span>
                          <select
                            disabled={Boolean(reschedulingAppointment)}
                            value={selectedWorkerId}
                            onChange={(event) => {
                              const worker = workers.find((item) => item.id === event.target.value);
                              setSelectedWorkerId(event.target.value);
                              setSelectedServiceId(defaultServiceIdForWorker(worker, services));
                            }}
                          >
                            {workers.map((worker) => (
                              <option key={worker.id} value={worker.id}>
                                {worker.name} · {worker.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field min-w-0">
                          <span>{t("fields.service")}</span>
                          <select
                            disabled={
                              !selectableServices.length || Boolean(reschedulingAppointment)
                            }
                            value={selectedServiceId}
                            onChange={(event) => setSelectedServiceId(event.target.value)}
                          >
                            {selectableServices.map((service) => (
                              <option key={service.id} value={service.id}>
                                {serviceName(service, locale)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="mt-5 min-w-0">
                        <p className="muted text-sm font-semibold">{t("booking.selectDate")}</p>
                        <div
                          aria-label={t("booking.selectDate")}
                          className="mt-3 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2"
                          tabIndex={0}
                        >
                          {dateStripDays.map((date) => {
                            const counts = slotCountsByDate.get(date) ?? { available: 0, total: 0 };
                            const selected = selectedDate === date;
                            const unavailable = counts.total === 0;
                            const limited = counts.available > 0 && counts.available <= 2;
                            const full = counts.available >= 3;
                            const weekend = isWeekend(date);
                            const disabled = unavailable;
                            return (
                              <button
                                aria-pressed={selected}
                                className={[
                                  "grid min-h-24 w-[5.25rem] shrink-0 gap-1 rounded-md border p-2 text-center transition sm:w-24 sm:p-3",
                                  selected
                                    ? "border-teal-700 bg-teal-50 text-teal-950"
                                    : "border-[var(--line)] bg-white text-[var(--foreground)]",
                                  disabled || weekend ? "opacity-50" : "",
                                ].join(" ")}
                                disabled={disabled}
                                data-testid={`strip-date-${date}`}
                                key={date}
                                aria-label={fullDateLabel(date, locale)}
                                onClick={() => selectStripDate(date)}
                                type="button"
                              >
                                <span className="text-xs font-bold uppercase">
                                  {weekdayLabel(date, locale)}
                                </span>
                                <span className="text-2xl font-bold">{dayNumber(date)}</span>
                                <span
                                  aria-label={
                                    full
                                      ? t("booking.availabilityFull")
                                      : limited
                                        ? t("booking.availabilityLimited")
                                        : t("booking.availabilityUnavailable")
                                  }
                                  className={[
                                    "mx-auto h-2.5 w-2.5 rounded-full",
                                    full
                                      ? "bg-teal-600"
                                      : limited
                                        ? "bg-amber-500"
                                        : "bg-slate-400",
                                  ].join(" ")}
                                />
                                {limited ? (
                                  <span className="text-xs font-semibold text-amber-800">
                                    {t("booking.left", { count: counts.available })}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
                        <DatePickerCalendar
                          bookingMaxDate={bookingMaxDate}
                          bookingMinDate={bookingMinDate}
                          calendarMonth={calendarMonth}
                          locale={locale}
                          selectCalendarDate={selectCalendarDate}
                          selectedDate={selectedDate}
                          setCalendarMonth={setCalendarMonth}
                          slotCountsByDate={slotCountsByDate}
                        />

                        <div className="grid min-w-0 gap-5">
                          {slotsForSelectedDate.length ? (
                            <>
                              {morningSlots.length ? (
                                <SlotGroup
                                  actionLabel={slotActionLabel}
                                  locale={locale}
                                  requestBooking={requestBooking}
                                  saving={saving}
                                  slots={morningSlots}
                                  timeZone={selectedWorker?.timezone}
                                  title={t("booking.morning")}
                                  user={user}
                                  userCanBook={slotUserCanBook}
                                />
                              ) : null}
                              {afternoonSlots.length ? (
                                <SlotGroup
                                  actionLabel={slotActionLabel}
                                  locale={locale}
                                  requestBooking={requestBooking}
                                  saving={saving}
                                  slots={afternoonSlots}
                                  timeZone={selectedWorker?.timezone}
                                  title={t("booking.afternoon")}
                                  user={user}
                                  userCanBook={slotUserCanBook}
                                />
                              ) : null}
                            </>
                          ) : (
                            <p className="muted text-sm">{t("booking.noSlotsForDate")}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      aria-labelledby="appointments-tab"
                      className="grid gap-6 p-5"
                      id="appointments-panel"
                      role="tabpanel"
                    >
                      <div>
                        <h2 className="text-xl font-bold">{t("appointments.myAppointments")}</h2>
                        <p className="muted text-sm">{t("appointments.subtitle")}</p>
                      </div>

                      {appointments.length ? (
                        <>
                          <section>
                            <h3 className="text-sm font-bold uppercase text-[var(--muted)]">
                              {t("appointments.upcoming")}
                            </h3>
                            <div className="mt-3 grid gap-3">
                              {upcomingAppointments.length ? (
                                upcomingAppointments.map((appointment) =>
                                  renderAppointmentCard(appointment),
                                )
                              ) : (
                                <p className="muted text-sm">{t("appointments.noUpcoming")}</p>
                              )}
                            </div>
                          </section>

                          {pastAppointments.length ? (
                            <section>
                              <h3 className="text-sm font-bold uppercase text-[var(--muted)]">
                                {t("appointments.past")}
                              </h3>
                              <div className="mt-3 grid gap-3">
                                {pastAppointments.map((appointment) =>
                                  renderAppointmentCard(appointment, true),
                                )}
                              </div>
                            </section>
                          ) : null}
                        </>
                      ) : (
                        <p className="muted text-sm">{t("appointments.empty")}</p>
                      )}
                    </div>
                  )}
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>

      {renderConfirmationDialog()}
      {renderAdminDrawer()}

      {bookingDialogOpen ? (
        <AppDialog
          backdropClassName="fixed inset-0 z-30 grid items-end bg-slate-950/50 px-0 sm:place-items-center sm:px-4 sm:py-6"
          className="surface max-h-full w-full overflow-auto rounded-b-none p-5 shadow-xl sm:max-w-lg sm:rounded-md"
          labelledBy="booking-dialog-title"
          onClose={closeBookingDialog}
          testId="booking-dialog-backdrop"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold" id="booking-dialog-title">
                {bookingDialogTitle}
              </h2>
              <p className="muted mt-1 text-sm">{bookingDialogSubtitle}</p>
            </div>
            <button
              aria-label={t("auth.close")}
              className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)]"
              disabled={saving}
              onClick={closeBookingDialog}
              ref={bookingCloseButtonRef}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <dl className="mt-5 grid gap-3 text-sm">
            <div className="border-b border-[var(--line)] pb-3">
              <dt className="muted font-semibold">{t("booking.patient")}</dt>
              <dd className="mt-1 font-bold">{user?.name ?? t("auth.account")}</dd>
            </div>
            <div className="border-b border-[var(--line)] pb-3">
              <dt className="muted font-semibold">{t("booking.time")}</dt>
              <dd className="mt-1 font-bold">{bookingDialogTime}</dd>
            </div>
            <div className="border-b border-[var(--line)] pb-3">
              <dt className="muted font-semibold">{t("booking.clinician")}</dt>
              <dd className="mt-1 font-bold">
                {bookingDialogClinician} · {bookingDialogService}
              </dd>
            </div>
            <div>
              <dt className="muted flex items-center gap-2 font-semibold">
                <MapPin aria-hidden="true" size={16} />
                {t("booking.location")}
              </dt>
              <dd className="mt-1 font-bold">{bookingDialogLocation}</dd>
            </div>
          </dl>

          <p className="muted mt-4 text-sm">{bookingDialogGuidance}</p>

          {confirmedAppointment && calendarDownloadHref ? (
            <a
              className="btn-primary mt-5 flex items-center justify-center gap-2"
              download={`appointment-${confirmedAppointment.id}.ics`}
              href={calendarDownloadHref}
            >
              <Download aria-hidden="true" size={18} />
              {t("booking.addToCalendar")}
            </a>
          ) : (
            <button
              className="btn-primary mt-5 w-full"
              disabled={!bookingDialogContext || saving}
              onClick={() => bookingDialogContext && bookSlot(bookingDialogContext)}
              type="button"
            >
              {isReschedulingBooking ? t("booking.confirmReschedule") : t("booking.confirmBook")}
            </button>
          )}
        </AppDialog>
      ) : null}

      {authDialogOpen ? (
        <AppDialog
          backdropClassName="fixed inset-0 z-30 grid place-items-center bg-slate-950/50 px-4 py-6"
          className="surface max-h-full w-full max-w-md overflow-auto p-5 shadow-xl"
          labelledBy="auth-dialog-title"
          onClose={closeAuthDialog}
          testId="auth-dialog-backdrop"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold" id="auth-dialog-title">
                {pendingBooking ? t("booking.signInToBook") : t("auth.account")}
              </h2>
              {pendingBooking ? (
                <p className="muted mt-1 text-sm">
                  {formatDateTime(
                    pendingBooking.slot.startsAt,
                    locale,
                    pendingBookingWorker?.timezone,
                  )}
                </p>
              ) : null}
            </div>
            <button
              aria-label={t("auth.close")}
              className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)]"
              disabled={saving}
              onClick={closeAuthDialog}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={submitAuth}>
            <div className="flex gap-2" aria-label={t("auth.mode")}>
              <button
                className={authMode === "login" ? "btn-primary" : "btn-secondary"}
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setAuthError(null);
                }}
              >
                {t("auth.login")}
              </button>
              <button
                className={authMode === "register" ? "btn-primary" : "btn-secondary"}
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setAuthError(null);
                }}
              >
                {t("auth.register")}
              </button>
            </div>
            {authMode === "register" ? (
              <label className="field">
                <span>{t("fields.name")}</span>
                <input
                  ref={authFirstFieldRef}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
            ) : null}
            <label className="field">
              <span>{t("fields.email")}</span>
              <input
                ref={authMode === "login" ? authFirstFieldRef : undefined}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>{t("fields.password")}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {authError ? (
              <p
                className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
                role="alert"
              >
                {errorMessage(authError)}
              </p>
            ) : null}
            <button className="btn-primary" type="submit" disabled={saving}>
              {authMode === "register" ? t("auth.createAccount") : t("auth.signIn")}
            </button>
          </form>
        </AppDialog>
      ) : null}

      {blockDialogOpen ? (
        <AppDialog
          backdropClassName="fixed inset-0 z-30 grid place-items-center bg-slate-950/50 px-4 py-6"
          className="surface max-h-full w-full max-w-md overflow-auto p-5 shadow-xl"
          labelledBy="block-dialog-title"
          onClose={closeBlockDialog}
          testId="block-dialog-backdrop"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold" id="block-dialog-title">
                {t("worker.block.title")}
              </h2>
              <p className="muted mt-1 text-sm">{t("worker.block.subtitle")}</p>
            </div>
            <button
              aria-label={t("auth.close")}
              className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)]"
              disabled={saving}
              onClick={closeBlockDialog}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={createBlockTime}>
            <label className="field">
              <span>{t("fields.startDate")}</span>
              <input
                onChange={(event) => setBlockDate(event.target.value)}
                ref={blockFirstFieldRef}
                required
                type="date"
                value={blockDate}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span>{t("worker.block.from")}</span>
                <input
                  onChange={(event) => setBlockStart(event.target.value)}
                  required
                  step={900}
                  type="time"
                  value={blockStart}
                />
              </label>
              <label className="field">
                <span>{t("worker.block.to")}</span>
                <input
                  onChange={(event) => setBlockEnd(event.target.value)}
                  required
                  step={900}
                  type="time"
                  value={blockEnd}
                />
              </label>
            </div>
            <label className="field">
              <span>{t("worker.block.reason")}</span>
              <input onChange={(event) => setBlockReason(event.target.value)} value={blockReason} />
            </label>
            <button className="btn-primary" disabled={saving} type="submit">
              {t("worker.block.save")}
            </button>
          </form>
        </AppDialog>
      ) : null}
    </main>
  );
}
