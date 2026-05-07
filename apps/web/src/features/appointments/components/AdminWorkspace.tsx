import { CalendarClock, Plus, Settings, Shield, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Locale } from "@/i18n/routing";
import type { AdminTab, Appointment, AppointmentStatus, Service, User, Worker } from "../types";
import { appointmentLocation, roleLabel, serviceName } from "../utils/appointments";
import { formatTime, fullDateLabel } from "../utils/date";

type AdminWorkspaceProps = {
  adminAvailableSlotsToday: number;
  adminCancellationsThisWeek: number;
  adminPatientCount: number;
  adminServices: Service[];
  adminTab: AdminTab;
  adminToday: string;
  adminTodayAppointments: Appointment[];
  adminUsers: User[];
  adminWorkerCount: number;
  appointmentStatusClass: (status: AppointmentStatus) => string;
  appointmentStatusLabel: (status: AppointmentStatus) => string;
  bookingPanel: ReactNode;
  locale: Locale;
  openCreateAdminUserDrawer: () => void;
  openCreateServiceDrawer: () => void;
  openEditAdminUserDrawer: (adminUser: User) => void;
  openEditServiceDrawer: (service: Service) => void;
  saving: boolean;
  setAdminTab: Dispatch<SetStateAction<AdminTab>>;
  updateAdminServiceActive: (service: Service, active: boolean) => Promise<void>;
  updateAdminUserActive: (adminUser: User, active: boolean) => Promise<void>;
  user: User | null;
  workers: Worker[];
};

export function AdminWorkspace({
  adminAvailableSlotsToday,
  adminCancellationsThisWeek,
  adminPatientCount,
  adminServices,
  adminTab,
  adminToday,
  adminTodayAppointments,
  adminUsers,
  adminWorkerCount,
  appointmentStatusClass,
  appointmentStatusLabel,
  bookingPanel,
  locale,
  openCreateAdminUserDrawer,
  openCreateServiceDrawer,
  openEditAdminUserDrawer,
  openEditServiceDrawer,
  saving,
  setAdminTab,
  updateAdminServiceActive,
  updateAdminUserActive,
  user,
  workers,
}: AdminWorkspaceProps) {
  const t = useTranslations();

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
      {adminTab === "booking" ? bookingPanel : null}
    </section>
  );
}
