import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Ref } from "react";
import type { Locale } from "@/i18n/routing";
import { cancellationPolicyWarningHours } from "../constants";
import type { PendingConfirmation, User } from "../types";
import {
  appointmentLocation,
  appointmentStartsWithinHours,
  serviceName,
} from "../utils/appointments";
import { formatDateTime } from "../utils/date";
import { AppDialog } from "./AppDialog";

type ConfirmationDialogProps = {
  closeConfirmationDialog: () => void;
  confirmPendingAction: () => Promise<void>;
  confirmationCancelButtonRef: Ref<HTMLButtonElement>;
  locale: Locale;
  pendingConfirmation: PendingConfirmation | null;
  saving: boolean;
  user: User | null;
  workerTimeZone: string;
};

export function ConfirmationDialog({
  closeConfirmationDialog,
  confirmPendingAction,
  confirmationCancelButtonRef,
  locale,
  pendingConfirmation,
  saving,
  user,
  workerTimeZone,
}: ConfirmationDialogProps) {
  const t = useTranslations();

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
