"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Languages,
  LogOut,
  MapPin,
  Shield,
  Stethoscope,
  UserCircle,
  UserPlus,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";

type Role = "PATIENT" | "WORKER" | "ADMIN";

type User = {
  id: string;
  email: string;
  role: Role;
  name: string;
  phone: string | null;
  preferredLocale: Locale;
  workerProfile: null | {
    id: string;
    title: string;
    location: string;
    timezone: string;
    appointmentDurationMinutes: number;
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
  active: boolean;
  services: Service[];
};

type Slot = {
  startsAt: string;
  endsAt: string;
  status?: "AVAILABLE" | "TAKEN";
};

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  patient: {
    name: string;
    email: string;
  };
  worker: {
    name: string;
    title: string;
    location: string;
    timezone: string;
  };
  service: Service;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const bookingHorizonDays = 90;
const dateStripDayCount = 14;
const dateStripCenterOffset = 6;

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
    `LOCATION:${escapeCalendarText(appointment.worker.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function timeToMinute(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function roleLabel(role: Role, t: ReturnType<typeof useTranslations>) {
  if (role === "ADMIN") return t("roles.admin");
  if (role === "WORKER") return t("roles.worker");
  return t("roles.patient");
}

function servicesForWorker(worker: Worker | undefined, fallbackServices: Service[]) {
  return worker ? worker.services : fallbackServices;
}

function defaultServiceIdForWorker(worker: Worker | undefined, fallbackServices: Service[]) {
  return servicesForWorker(worker, fallbackServices)[0]?.id ?? "";
}

function workerSupportsService(worker: Worker | undefined, serviceId: string) {
  return Boolean(serviceId && worker?.services.some((service) => service.id === serviceId));
}

function SlotGroup({
  locale,
  requestBooking,
  saving,
  slots,
  timeZone,
  title,
  user,
  userCanBook,
}: {
  locale: Locale;
  requestBooking: (slot: Slot) => void;
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
              ) : (
                <button
                  className="btn-primary min-w-24"
                  disabled={(user !== null && !userCanBook) || saving}
                  onClick={() => requestBooking(slot)}
                  type="button"
                >
                  {t("booking.book")}
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
  const [saving, setSaving] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [bookingDialogSlot, setBookingDialogSlot] = useState<Slot | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [workerLocation, setWorkerLocation] = useState("Main clinic");
  const [availabilityStart, setAvailabilityStart] = useState("09:00");
  const [availabilityEnd, setAvailabilityEnd] = useState("16:00");
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [adminUserRole, setAdminUserRole] = useState<Role>("WORKER");
  const [adminUserEmail, setAdminUserEmail] = useState("");
  const [adminUserName, setAdminUserName] = useState("");
  const [adminWorkerLocation, setAdminWorkerLocation] = useState("Main clinic");
  const [serviceNameEn, setServiceNameEn] = useState("");
  const [serviceNameFi, setServiceNameFi] = useState("");
  const authFirstFieldRef = useRef<HTMLInputElement>(null);
  const latestSlotsRequestRef = useRef(0);

  const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId);
  const selectableServices = servicesForWorker(selectedWorker, services);
  const selectedWorkerSupportsService = workerSupportsService(selectedWorker, selectedServiceId);
  const selectedService =
    selectableServices.find((service) => service.id === selectedServiceId) ??
    services.find((service) => service.id === selectedServiceId);
  const bookingMaxDate = useMemo(
    () => addDays(bookingMinDate, bookingHorizonDays - 1),
    [bookingMinDate],
  );
  const dateStripDays = useMemo(
    () => Array.from({ length: dateStripDayCount }, (_, index) => addDays(dateStripStart, index)),
    [dateStripStart],
  );

  const userCanBook = user?.role === "PATIENT" || user?.role === "ADMIN";
  const profileInitial =
    user?.name.trim().charAt(0).toUpperCase() || user?.email.charAt(0).toUpperCase();

  const upcomingAppointment = useMemo(() => {
    if (user?.role !== "PATIENT") return null;
    const now = Date.now();
    return (
      appointments
        .filter(
          (appointment) =>
            appointment.status === "CONFIRMED" && new Date(appointment.startsAt).getTime() > now,
        )
        .sort(
          (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        )[0] ?? null
    );
  }, [appointments, user?.role]);

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
  const bookingDialogOpen = Boolean(bookingDialogSlot || confirmedAppointment);
  const bookingDialogTime = confirmedAppointment
    ? formatDateTime(confirmedAppointment.startsAt, locale, confirmedAppointment.worker.timezone)
    : bookingDialogSlot
      ? formatDateTime(bookingDialogSlot.startsAt, locale, selectedWorker?.timezone)
      : "";
  const bookingDialogClinician = confirmedAppointment?.worker.name ?? selectedWorker?.name ?? "";
  const bookingDialogService = confirmedAppointment
    ? serviceName(confirmedAppointment.service, locale)
    : selectedService
      ? serviceName(selectedService, locale)
      : "";
  const bookingDialogLocation =
    confirmedAppointment?.worker.location ?? selectedWorker?.location ?? "";

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
    const nextServiceId = workerSupportsService(nextWorker, selectedServiceId)
      ? selectedServiceId
      : defaultServiceIdForWorker(nextWorker, serviceData.services);

    setSelectedWorkerId(nextWorker?.id ?? "");
    setSelectedServiceId(nextServiceId);
  }

  async function refreshSession() {
    const data = await apiRequest<{ user: User | null }>("/auth/me");
    setUser(data.user);
    if (data.user) {
      const appointmentData = await apiRequest<{ appointments: Appointment[] }>("/appointments");
      setAppointments(appointmentData.appointments);
    } else {
      setAppointments([]);
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

  useEffect(() => {
    void run(async () => {
      await loadCatalog();
      await refreshSession();
    });
  }, []);

  useEffect(() => {
    if (!selectedWorkerId || !selectedServiceId || !selectedWorkerSupportsService) {
      latestSlotsRequestRef.current += 1;
      setSlots([]);
      return;
    }
    void run(fetchSlots);
  }, [dateStripStart, selectedServiceId, selectedWorkerId, selectedWorkerSupportsService]);

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
    if (!authDialogOpen && !profileMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (authDialogOpen) closeAuthDialog();
      setProfileMenuOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [authDialogOpen, profileMenuOpen, saving]);

  function openAuthDialog(mode: "login" | "register" = "login", slot: Slot | null = null) {
    setAuthMode(mode);
    setPendingSlot(slot);
    setAuthError(null);
    setError(null);
    setNotice(null);
    setAuthDialogOpen(true);
    setProfileMenuOpen(false);
  }

  function closeAuthDialog() {
    if (saving) return;
    setAuthDialogOpen(false);
    setPendingSlot(null);
    setAuthError(null);
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

  async function createAppointment(slot: Slot) {
    const data = await apiRequest<{ appointment: Appointment }>("/appointments", {
      method: "POST",
      body: JSON.stringify({
        workerProfileId: selectedWorkerId,
        serviceId: selectedServiceId,
        startsAt: slot.startsAt,
      }),
    });
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

      const slotToBook = pendingSlot;
      setPendingSlot(null);
      setAuthDialogOpen(false);

      if (slotToBook) {
        setBookingDialogSlot(slotToBook);
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
      setProfileMenuOpen(false);
    }, t("notices.signedOut"));
  }

  async function loadSlots() {
    await run(fetchSlots);
  }

  async function bookSlot(slot: Slot) {
    await run(async () => {
      const appointment = await createAppointment(slot);
      setConfirmedAppointment(appointment);
    }, t("notices.appointmentBooked"));
  }

  function requestBooking(slot: Slot) {
    if (!user) {
      openAuthDialog("login", slot);
      return;
    }
    if (!userCanBook) {
      setError("FORBIDDEN");
      setNotice(null);
      return;
    }
    setBookingDialogSlot(slot);
    setConfirmedAppointment(null);
  }

  function closeBookingDialog() {
    if (saving) return;
    setBookingDialogSlot(null);
    setConfirmedAppointment(null);
  }

  async function cancelAppointment(id: string) {
    await run(async () => {
      await apiRequest(`/appointments/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Canceled by user" }),
      });
      await Promise.all([refreshSession(), fetchSlots()]);
    }, t("notices.appointmentCanceled"));
  }

  async function saveAvailability(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await apiRequest("/worker/settings", {
        method: "PUT",
        body: JSON.stringify({
          location: workerLocation,
          windows: weekdays.map((weekday) => ({
            weekday,
            startMinute: timeToMinute(availabilityStart),
            endMinute: timeToMinute(availabilityEnd),
            active: true,
          })),
        }),
      });
      await refreshSession();
    }, t("notices.availabilitySaved"));
  }

  async function createAdminUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await apiRequest("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: adminUserEmail,
          name: adminUserName,
          role: adminUserRole,
          password: "ChangeMe123!",
          preferredLocale: locale,
          worker:
            adminUserRole === "WORKER"
              ? {
                  location: adminWorkerLocation,
                }
              : undefined,
        }),
      });
      setAdminUserEmail("");
      setAdminUserName("");
      setAdminWorkerLocation("Main clinic");
    }, t("notices.userCreated"));
  }

  async function createService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await apiRequest("/admin/services", {
        method: "POST",
        body: JSON.stringify({
          nameEn: serviceNameEn,
          nameFi: serviceNameFi,
          active: true,
        }),
      });
      setServiceNameEn("");
      setServiceNameFi("");
      await loadCatalog();
    }, t("notices.serviceCreated"));
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
            <section className="flex flex-col gap-3 rounded-md border border-teal-300 bg-teal-50 p-4 text-teal-950 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 text-teal-700" size={22} />
                <div>
                  <h2 className="font-bold">{t("appointments.next")}</h2>
                  <p className="text-sm">
                    {appointmentFormatter(upcomingAppointment)} ·{" "}
                    {upcomingAppointment.worker.location}
                  </p>
                </div>
              </div>
              <button
                className="btn-secondary border-teal-300 bg-white text-teal-950"
                disabled={saving}
                onClick={() => cancelAppointment(upcomingAppointment.id)}
                type="button"
              >
                {t("appointments.cancel")}
              </button>
            </section>
          ) : null}

          <section className="surface min-w-0 overflow-hidden p-5">
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

            <div className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
              <label className="field min-w-0">
                <span>{t("fields.worker")}</span>
                <select
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
                  disabled={!selectableServices.length}
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
                        locale={locale}
                        requestBooking={requestBooking}
                        saving={saving}
                        slots={morningSlots}
                        timeZone={selectedWorker?.timezone}
                        title={t("booking.morning")}
                        user={user}
                        userCanBook={userCanBook}
                      />
                    ) : null}
                    {afternoonSlots.length ? (
                      <SlotGroup
                        locale={locale}
                        requestBooking={requestBooking}
                        saving={saving}
                        slots={afternoonSlots}
                        timeZone={selectedWorker?.timezone}
                        title={t("booking.afternoon")}
                        user={user}
                        userCanBook={userCanBook}
                      />
                    ) : null}
                  </>
                ) : (
                  <p className="muted text-sm">{t("booking.noSlotsForDate")}</p>
                )}
              </div>
            </div>
          </section>

          {user ? (
            <section className="surface p-5">
              <h2 className="text-xl font-bold">{t("appointments.title")}</h2>
              <div className="mt-4 grid gap-3">
                {appointments.length ? (
                  appointments.map((appointment) => (
                    <div
                      className="surface flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                      key={appointment.id}
                    >
                      <div>
                        <p className="font-semibold">{appointmentFormatter(appointment)}</p>
                        <p className="muted text-sm">
                          {appointment.status} · {appointment.patient.name}
                        </p>
                      </div>
                      {appointment.status === "CONFIRMED" ? (
                        <button
                          className="btn-secondary"
                          disabled={saving}
                          onClick={() => cancelAppointment(appointment.id)}
                        >
                          {t("appointments.cancel")}
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="muted text-sm">{t("appointments.empty")}</p>
                )}
              </div>
            </section>
          ) : null}

          {user?.role === "WORKER" ? (
            <section className="surface p-5">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Stethoscope aria-hidden="true" size={22} />
                {t("worker.title")}
              </h2>
              <form className="mt-4 grid gap-4" onSubmit={saveAvailability}>
                <label className="field">
                  <span>{t("fields.location")}</span>
                  <input
                    value={workerLocation}
                    onChange={(event) => setWorkerLocation(event.target.value)}
                    required
                  />
                </label>
                <fieldset className="grid gap-3">
                  <legend className="font-semibold">{t("worker.weekdays")}</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[1, 2, 3, 4, 5].map((weekday) => (
                      <label className="flex items-center gap-2" key={weekday}>
                        <input
                          type="checkbox"
                          checked={weekdays.includes(weekday)}
                          onChange={(event) => {
                            setWeekdays((current) =>
                              event.target.checked
                                ? [...current, weekday].sort()
                                : current.filter((item) => item !== weekday),
                            );
                          }}
                        />
                        {t(`weekdays.${weekday}`)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="field">
                    <span>{t("worker.start")}</span>
                    <input
                      type="time"
                      step={900}
                      value={availabilityStart}
                      onChange={(event) => setAvailabilityStart(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>{t("worker.end")}</span>
                    <input
                      type="time"
                      step={900}
                      value={availabilityEnd}
                      onChange={(event) => setAvailabilityEnd(event.target.value)}
                    />
                  </label>
                </div>
                <button className="btn-primary" type="submit" disabled={saving}>
                  {t("worker.saveAvailability")}
                </button>
              </form>
            </section>
          ) : null}

          {user?.role === "ADMIN" ? (
            <section className="surface p-5">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                <Shield aria-hidden="true" size={22} />
                {t("admin.title")}
              </h2>
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <form className="grid gap-4" onSubmit={createAdminUser}>
                  <h3 className="font-bold">{t("admin.createUser")}</h3>
                  <label className="field">
                    <span>{t("fields.name")}</span>
                    <input
                      value={adminUserName}
                      onChange={(event) => setAdminUserName(event.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t("fields.email")}</span>
                    <input
                      type="email"
                      value={adminUserEmail}
                      onChange={(event) => setAdminUserEmail(event.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t("fields.role")}</span>
                    <select
                      value={adminUserRole}
                      onChange={(event) => setAdminUserRole(event.target.value as Role)}
                    >
                      <option value="PATIENT">{t("roles.patient")}</option>
                      <option value="WORKER">{t("roles.worker")}</option>
                      <option value="ADMIN">{t("roles.admin")}</option>
                    </select>
                  </label>
                  {adminUserRole === "WORKER" ? (
                    <label className="field">
                      <span>{t("fields.location")}</span>
                      <input
                        value={adminWorkerLocation}
                        onChange={(event) => setAdminWorkerLocation(event.target.value)}
                        required
                      />
                    </label>
                  ) : null}
                  <button
                    className="btn-primary flex items-center justify-center gap-2"
                    type="submit"
                  >
                    <UserPlus aria-hidden="true" size={18} />
                    {t("admin.saveUser")}
                  </button>
                </form>

                <form className="grid gap-4" onSubmit={createService}>
                  <h3 className="font-bold">{t("admin.createService")}</h3>
                  <label className="field">
                    <span>{t("admin.serviceNameEn")}</span>
                    <input
                      value={serviceNameEn}
                      onChange={(event) => setServiceNameEn(event.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t("admin.serviceNameFi")}</span>
                    <input
                      value={serviceNameFi}
                      onChange={(event) => setServiceNameFi(event.target.value)}
                      required
                    />
                  </label>
                  <button className="btn-primary" type="submit">
                    {t("admin.saveService")}
                  </button>
                </form>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {bookingDialogOpen ? (
        <div className="fixed inset-0 z-30 grid items-end bg-slate-950/50 px-0 sm:place-items-center sm:px-4 sm:py-6">
          <section
            aria-labelledby="booking-dialog-title"
            aria-modal="true"
            className="surface max-h-full w-full overflow-auto rounded-b-none p-5 shadow-xl sm:max-w-lg sm:rounded-md"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold" id="booking-dialog-title">
                  {confirmedAppointment ? t("booking.confirmedTitle") : t("booking.confirmTitle")}
                </h2>
                <p className="muted mt-1 text-sm">{t("booking.confirmSubtitle")}</p>
              </div>
              <button
                aria-label={t("auth.close")}
                className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)]"
                disabled={saving}
                onClick={closeBookingDialog}
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

            <p className="muted mt-4 text-sm">{t("booking.cancelGuidance")}</p>

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
                disabled={!bookingDialogSlot || saving}
                onClick={() => bookingDialogSlot && bookSlot(bookingDialogSlot)}
                type="button"
              >
                {t("booking.confirmBook")}
              </button>
            )}
          </section>
        </div>
      ) : null}

      {authDialogOpen ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/50 px-4 py-6">
          <section
            aria-labelledby="auth-dialog-title"
            aria-modal="true"
            className="surface max-h-full w-full max-w-md overflow-auto p-5 shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold" id="auth-dialog-title">
                  {pendingSlot ? t("booking.signInToBook") : t("auth.account")}
                </h2>
                {pendingSlot ? (
                  <p className="muted mt-1 text-sm">
                    {formatDateTime(pendingSlot.startsAt, locale, selectedWorker?.timezone)}
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
          </section>
        </div>
      ) : null}
    </main>
  );
}
