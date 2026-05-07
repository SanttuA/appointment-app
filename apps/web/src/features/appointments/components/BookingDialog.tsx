import { Download, MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Ref } from "react";
import type { Appointment, BookingContext, User } from "../types";
import { AppDialog } from "./AppDialog";

type BookingDialogProps = {
  bookSlot: (booking: BookingContext) => Promise<void>;
  bookingCloseButtonRef: Ref<HTMLButtonElement>;
  bookingDialogClinician: string;
  bookingDialogContext: BookingContext | null;
  bookingDialogGuidance: string;
  bookingDialogLocation: string;
  bookingDialogOpen: boolean;
  bookingDialogService: string;
  bookingDialogSubtitle: string;
  bookingDialogTime: string;
  bookingDialogTitle: string;
  calendarDownloadHref: string | null;
  closeBookingDialog: () => void;
  confirmedAppointment: Appointment | null;
  isReschedulingBooking: boolean;
  saving: boolean;
  user: User | null;
};

export function BookingDialog({
  bookSlot,
  bookingCloseButtonRef,
  bookingDialogClinician,
  bookingDialogContext,
  bookingDialogGuidance,
  bookingDialogLocation,
  bookingDialogOpen,
  bookingDialogService,
  bookingDialogSubtitle,
  bookingDialogTime,
  bookingDialogTitle,
  calendarDownloadHref,
  closeBookingDialog,
  confirmedAppointment,
  isReschedulingBooking,
  saving,
  user,
}: BookingDialogProps) {
  const t = useTranslations();

  if (!bookingDialogOpen) return null;

  return (
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
  );
}
