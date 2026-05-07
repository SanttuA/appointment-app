import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import type { Appointment, AppointmentStatus } from "../types";
import { appointmentLocation, serviceName } from "../utils/appointments";
import { formatDateTime } from "../utils/date";

type AppointmentCardProps = {
  appointment: Appointment;
  appointmentStatusClass: (status: AppointmentStatus) => string;
  appointmentStatusLabel: (status: AppointmentStatus) => string;
  history?: boolean;
  openCancelAppointmentConfirmation: (appointment: Appointment) => void;
  locale: Locale;
  saving: boolean;
  setAppointmentCardRef: (id: string) => (node: HTMLDivElement | null) => void;
  showPatientName: boolean;
  startReschedule: (appointment: Appointment) => void;
};

export function AppointmentCard({
  appointment,
  appointmentStatusClass,
  appointmentStatusLabel,
  history = false,
  openCancelAppointmentConfirmation,
  locale,
  saving,
  setAppointmentCardRef,
  showPatientName,
  startReschedule,
}: AppointmentCardProps) {
  const t = useTranslations();
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
        {showPatientName ? <p className="muted mt-1 text-sm">{appointment.patient.name}</p> : null}
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
