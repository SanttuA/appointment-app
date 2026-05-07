import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import type { Appointment, AppointmentStatus, WorkerAppointmentStatusAction } from "../types";
import { appointmentLocation, serviceName } from "../utils/appointments";
import { formatTime } from "../utils/date";

type WorkerAppointmentEventProps = {
  appointment: Appointment;
  appointmentStatusClass: (status: AppointmentStatus) => string;
  appointmentStatusLabel: (status: AppointmentStatus) => string;
  compact?: boolean;
  locale: Locale;
  openAppointmentStatusConfirmation: (
    appointment: Appointment,
    status: WorkerAppointmentStatusAction,
  ) => void;
  openCancelAppointmentConfirmation: (appointment: Appointment) => void;
  saving: boolean;
  workerTimeZone: string;
};

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

export function WorkerAppointmentEvent({
  appointment,
  appointmentStatusClass,
  appointmentStatusLabel,
  compact = false,
  locale,
  openAppointmentStatusConfirmation,
  openCancelAppointmentConfirmation,
  saving,
  workerTimeZone,
}: WorkerAppointmentEventProps) {
  const t = useTranslations();
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
            {serviceName(appointment.service, locale)} · {appointmentLocation(appointment)}
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
