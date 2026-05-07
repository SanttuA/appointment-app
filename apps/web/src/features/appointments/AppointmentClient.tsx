"use client";

import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Languages,
  LogOut,
  Plus,
  Settings,
  Stethoscope,
  Trash2,
  UserCircle,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { apiRequest } from "./api";
import { AdminManagementDrawer } from "./components/AdminManagementDrawer";
import { AdminWorkspace } from "./components/AdminWorkspace";
import { AuthDialog } from "./components/AuthDialog";
import { BlockTimeDialog } from "./components/BlockTimeDialog";
import { BookingDialog } from "./components/BookingDialog";
import { BookingPanel } from "./components/BookingPanel";
import { ConfirmationDialog } from "./components/ConfirmationDialog";
import { AppointmentCard } from "./components/AppointmentCard";
import { WorkerAppointmentEvent } from "./components/WorkerAppointmentEvent";
import { bookingHorizonDays, dateStripDayCount } from "./constants";
import type {
  AdminDrawer,
  AdminServiceForm,
  AdminTab,
  AdminUserForm,
  Appointment,
  AppointmentStatus,
  AvailabilityWindow,
  BookingContext,
  PatientTab,
  PendingConfirmation,
  Service,
  Slot,
  TimeOff,
  User,
  Worker,
  WorkerAppointmentStatusAction,
  WorkerDayForm,
  WorkerTab,
} from "./types";
import {
  appointmentLocation,
  calendarHref,
  defaultServiceIdForWorker,
  defaultWorkerDayForms,
  roleLabel,
  serviceName,
  servicesForWorker,
  workerSupportsService,
} from "./utils/appointments";
import {
  addDays,
  ceilToSlotStep,
  centerDateStripStart,
  clampInputDate,
  dayNumber,
  formatDateKey,
  formatDateTime,
  formatLocalInputDate,
  formatTime,
  fullDateLabel,
  inputDateMinuteInTimeZone,
  inputDateStartInTimeZone,
  localHour,
  minuteToTime,
  monthStart,
  timeToMinute,
  tomorrowInputDate,
  weekdayLabel,
  weekStartMonday,
} from "./utils/date";

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
    return (
      <AppointmentCard
        appointment={appointment}
        appointmentStatusClass={appointmentStatusClass}
        appointmentStatusLabel={appointmentStatusLabel}
        history={history}
        key={appointment.id}
        locale={locale}
        openCancelAppointmentConfirmation={openCancelAppointmentConfirmation}
        saving={saving}
        setAppointmentCardRef={setAppointmentCardRef}
        showPatientName={user?.role !== "PATIENT"}
        startReschedule={startReschedule}
      />
    );
  }

  function renderWorkerAppointmentEvent(appointment: Appointment, compact = false) {
    return (
      <WorkerAppointmentEvent
        appointment={appointment}
        appointmentStatusClass={appointmentStatusClass}
        appointmentStatusLabel={appointmentStatusLabel}
        compact={compact}
        key={appointment.id}
        locale={locale}
        openAppointmentStatusConfirmation={openAppointmentStatusConfirmation}
        openCancelAppointmentConfirmation={openCancelAppointmentConfirmation}
        saving={saving}
        workerTimeZone={workerTimeZone}
      />
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
      <BookingPanel
        appointmentFormatter={appointmentFormatter}
        bookingMaxDate={bookingMaxDate}
        bookingMinDate={bookingMinDate}
        calendarMonth={calendarMonth}
        cancelReschedule={cancelReschedule}
        dateStripDays={dateStripDays}
        id={id}
        labelledBy={labelledBy}
        loadSlots={loadSlots}
        locale={locale}
        morningSlots={morningSlots}
        afternoonSlots={afternoonSlots}
        readOnly={readOnly}
        requestBooking={requestBooking}
        reschedulingAppointment={reschedulingAppointment}
        saving={saving}
        selectableServices={selectableServices}
        selectedDate={selectedDate}
        selectedServiceId={selectedServiceId}
        selectedWorker={selectedWorker}
        selectedWorkerId={selectedWorkerId}
        selectCalendarDate={selectCalendarDate}
        selectStripDate={selectStripDate}
        services={services}
        setCalendarMonth={setCalendarMonth}
        setSelectedServiceId={setSelectedServiceId}
        setSelectedWorkerId={setSelectedWorkerId}
        slotActionLabel={slotActionLabel}
        slotCountsByDate={slotCountsByDate}
        slotsForSelectedDate={slotsForSelectedDate}
        slotUserCanBook={slotUserCanBook}
        subtitle={subtitle}
        title={title}
        user={user}
        workers={workers}
      />
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

  function renderAdminWorkspace() {
    return (
      <AdminWorkspace
        adminAvailableSlotsToday={adminAvailableSlotsToday}
        adminCancellationsThisWeek={adminCancellationsThisWeek}
        adminPatientCount={adminPatientCount}
        adminServices={adminServices}
        adminTab={adminTab}
        adminToday={adminToday}
        adminTodayAppointments={adminTodayAppointments}
        adminUsers={adminUsers}
        adminWorkerCount={adminWorkerCount}
        appointmentStatusClass={appointmentStatusClass}
        appointmentStatusLabel={appointmentStatusLabel}
        bookingPanel={renderBookingPanel({
          id: "admin-booking-panel",
          labelledBy: "admin-booking-tab",
          readOnly: true,
          subtitle: t("admin.booking.subtitle"),
          title: t("admin.booking.title"),
        })}
        locale={locale}
        openCreateAdminUserDrawer={openCreateAdminUserDrawer}
        openCreateServiceDrawer={openCreateServiceDrawer}
        openEditAdminUserDrawer={openEditAdminUserDrawer}
        openEditServiceDrawer={openEditServiceDrawer}
        saving={saving}
        setAdminTab={setAdminTab}
        updateAdminServiceActive={updateAdminServiceActive}
        updateAdminUserActive={updateAdminUserActive}
        user={user}
        workers={workers}
      />
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
                    renderBookingPanel({
                      id: "booking-panel",
                      labelledBy: "booking-tab",
                    })
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

      <ConfirmationDialog
        closeConfirmationDialog={closeConfirmationDialog}
        confirmPendingAction={confirmPendingAction}
        confirmationCancelButtonRef={confirmationCancelButtonRef}
        locale={locale}
        pendingConfirmation={pendingConfirmation}
        saving={saving}
        user={user}
        workerTimeZone={workerTimeZone}
      />
      <AdminManagementDrawer
        adminDrawer={adminDrawer}
        adminDrawerCloseButtonRef={adminDrawerCloseButtonRef}
        adminServiceForm={adminServiceForm}
        adminUserForm={adminUserForm}
        adminUsers={adminUsers}
        closeAdminDrawer={closeAdminDrawer}
        saving={saving}
        submitAdminService={submitAdminService}
        submitAdminUser={submitAdminUser}
        updateAdminServiceForm={updateAdminServiceForm}
        updateAdminUserForm={updateAdminUserForm}
        user={user}
      />

      <BookingDialog
        bookSlot={bookSlot}
        bookingCloseButtonRef={bookingCloseButtonRef}
        bookingDialogClinician={bookingDialogClinician}
        bookingDialogContext={bookingDialogContext}
        bookingDialogGuidance={bookingDialogGuidance}
        bookingDialogLocation={bookingDialogLocation}
        bookingDialogOpen={bookingDialogOpen}
        bookingDialogService={bookingDialogService}
        bookingDialogSubtitle={bookingDialogSubtitle}
        bookingDialogTime={bookingDialogTime}
        bookingDialogTitle={bookingDialogTitle}
        calendarDownloadHref={calendarDownloadHref}
        closeBookingDialog={closeBookingDialog}
        confirmedAppointment={confirmedAppointment}
        isReschedulingBooking={isReschedulingBooking}
        saving={saving}
        user={user}
      />
      <AuthDialog
        authDialogOpen={authDialogOpen}
        authError={authError}
        authFirstFieldRef={authFirstFieldRef}
        authMode={authMode}
        closeAuthDialog={closeAuthDialog}
        email={email}
        errorMessage={errorMessage}
        locale={locale}
        name={name}
        password={password}
        pendingBooking={pendingBooking}
        pendingBookingWorker={pendingBookingWorker}
        saving={saving}
        setAuthError={setAuthError}
        setAuthMode={setAuthMode}
        setEmail={setEmail}
        setName={setName}
        setPassword={setPassword}
        submitAuth={submitAuth}
      />
      <BlockTimeDialog
        blockDate={blockDate}
        blockDialogOpen={blockDialogOpen}
        blockEnd={blockEnd}
        blockFirstFieldRef={blockFirstFieldRef}
        blockReason={blockReason}
        blockStart={blockStart}
        closeBlockDialog={closeBlockDialog}
        createBlockTime={createBlockTime}
        saving={saving}
        setBlockDate={setBlockDate}
        setBlockEnd={setBlockEnd}
        setBlockReason={setBlockReason}
        setBlockStart={setBlockStart}
      />
    </main>
  );
}
