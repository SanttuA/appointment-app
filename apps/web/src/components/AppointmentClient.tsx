"use client";

import { CalendarClock, Languages, LogOut, Shield, Stethoscope, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
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
  timezone: string;
  appointmentDurationMinutes: number;
  active: boolean;
  services: Service[];
};

type Slot = {
  startsAt: string;
  endsAt: string;
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

function tomorrowInputDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
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

function timeToMinute(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function roleLabel(role: Role, t: ReturnType<typeof useTranslations>) {
  if (role === "ADMIN") return t("roles.admin");
  if (role === "WORKER") return t("roles.worker");
  return t("roles.patient");
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
  const [selectedDate, setSelectedDate] = useState(tomorrowInputDate);
  const [saving, setSaving] = useState(false);
  const [availabilityStart, setAvailabilityStart] = useState("09:00");
  const [availabilityEnd, setAvailabilityEnd] = useState("16:00");
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [adminUserRole, setAdminUserRole] = useState<Role>("WORKER");
  const [adminUserEmail, setAdminUserEmail] = useState("");
  const [adminUserName, setAdminUserName] = useState("");
  const [serviceNameEn, setServiceNameEn] = useState("");
  const [serviceNameFi, setServiceNameFi] = useState("");

  const selectedWorker = workers.find((worker) => worker.id === selectedWorkerId);
  const selectableServices = selectedWorker?.services.length ? selectedWorker.services : services;

  const userCanBook = user?.role === "PATIENT" || user?.role === "ADMIN";

  const appointmentFormatter = useMemo(
    () => (appointment: Appointment) =>
      `${formatDateTime(
        appointment.startsAt,
        locale,
        appointment.worker.timezone,
      )} · ${serviceName(appointment.service, locale)} · ${appointment.worker.name}`,
    [locale],
  );

  async function loadCatalog() {
    const [serviceData, workerData] = await Promise.all([
      apiRequest<{ services: Service[] }>("/services"),
      apiRequest<{ workers: Worker[] }>("/workers"),
    ]);
    setServices(serviceData.services);
    setWorkers(workerData.workers);
    setSelectedWorkerId((current) => current || workerData.workers[0]?.id || "");
    setSelectedServiceId((current) => current || serviceData.services[0]?.id || "");
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

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
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
    }, t("notices.signedIn"));
  }

  async function logout() {
    await run(async () => {
      await apiRequest("/auth/logout", { method: "POST" });
      setUser(null);
      setAppointments([]);
    }, t("notices.signedOut"));
  }

  async function loadSlots() {
    await run(async () => {
      if (!selectedWorkerId || !selectedServiceId) return;
      const from = new Date(`${selectedDate}T00:00:00.000Z`);
      const to = new Date(from);
      to.setUTCDate(to.getUTCDate() + 7);
      const params = new URLSearchParams({
        serviceId: selectedServiceId,
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const data = await apiRequest<{ slots: Slot[] }>(
        `/workers/${selectedWorkerId}/slots?${params.toString()}`,
      );
      setSlots(data.slots);
    });
  }

  async function bookSlot(slot: Slot) {
    await run(async () => {
      await apiRequest("/appointments", {
        method: "POST",
        body: JSON.stringify({
          workerProfileId: selectedWorkerId,
          serviceId: selectedServiceId,
          startsAt: slot.startsAt,
        }),
      });
      await Promise.all([refreshSession(), loadSlots()]);
    }, t("notices.appointmentBooked"));
  }

  async function cancelAppointment(id: string) {
    await run(async () => {
      await apiRequest(`/appointments/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Canceled by user" }),
      });
      await refreshSession();
    }, t("notices.appointmentCanceled"));
  }

  async function saveAvailability(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await apiRequest("/worker/availability", {
        method: "PUT",
        body: JSON.stringify({
          windows: weekdays.map((weekday) => ({
            weekday,
            startMinute: timeToMinute(availabilityStart),
            endMinute: timeToMinute(availabilityEnd),
            active: true,
          })),
        }),
      });
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
        }),
      });
      setAdminUserEmail("");
      setAdminUserName("");
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
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[340px_1fr] lg:px-8">
        <aside className="surface p-5">
          {user ? (
            <div className="grid gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-teal-700">
                  {roleLabel(user.role, t)}
                </p>
                <h2 className="mt-1 text-xl font-bold">{user.name}</h2>
                <p className="muted break-words text-sm">{user.email}</p>
              </div>
              <button
                className="btn-secondary flex items-center justify-center gap-2"
                onClick={logout}
              >
                <LogOut aria-hidden="true" size={18} />
                {t("auth.logout")}
              </button>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={submitAuth}>
              <div className="flex gap-2" aria-label={t("auth.mode")}>
                <button
                  className={authMode === "login" ? "btn-primary" : "btn-secondary"}
                  type="button"
                  onClick={() => setAuthMode("login")}
                >
                  {t("auth.login")}
                </button>
                <button
                  className={authMode === "register" ? "btn-primary" : "btn-secondary"}
                  type="button"
                  onClick={() => setAuthMode("register")}
                >
                  {t("auth.register")}
                </button>
              </div>
              {authMode === "register" ? (
                <label className="field">
                  <span>{t("fields.name")}</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} required />
                </label>
              ) : null}
              <label className="field">
                <span>{t("fields.email")}</span>
                <input
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
              <button className="btn-primary" type="submit" disabled={saving}>
                {authMode === "register" ? t("auth.createAccount") : t("auth.signIn")}
              </button>
            </form>
          )}

          {error ? (
            <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
              {errorMessage(error)}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-900">
              {notice}
            </p>
          ) : null}
        </aside>

        <div className="grid gap-5">
          <section className="surface p-5">
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

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="field">
                <span>{t("fields.worker")}</span>
                <select
                  value={selectedWorkerId}
                  onChange={(event) => {
                    const worker = workers.find((item) => item.id === event.target.value);
                    setSelectedWorkerId(event.target.value);
                    setSelectedServiceId(worker?.services[0]?.id ?? services[0]?.id ?? "");
                  }}
                >
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name} · {worker.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("fields.service")}</span>
                <select
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
              <label className="field">
                <span>{t("fields.startDate")}</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {slots.length ? (
                slots.slice(0, 12).map((slot) => (
                  <div
                    className="surface flex items-center justify-between gap-3 p-3"
                    key={slot.startsAt}
                  >
                    <span className="text-sm font-semibold">
                      {formatDateTime(slot.startsAt, locale, selectedWorker?.timezone)}
                    </span>
                    <button
                      className="btn-primary"
                      disabled={!userCanBook || saving}
                      onClick={() => bookSlot(slot)}
                    >
                      {t("booking.book")}
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted text-sm">{t("booking.noSlots")}</p>
              )}
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
    </main>
  );
}
