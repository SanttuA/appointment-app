import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import type { Appointment, Service, Slot, SlotCountsByDate, User, Worker } from "../types";
import { appointmentLocation, defaultServiceIdForWorker, serviceName } from "../utils/appointments";
import { dayNumber, fullDateLabel, isWeekend, weekdayLabel } from "../utils/date";
import { DatePickerCalendar } from "./DatePickerCalendar";
import { SlotGroup } from "./SlotGroup";

type BookingPanelProps = {
  appointmentFormatter: (appointment: Appointment) => string;
  bookingMaxDate: string;
  bookingMinDate: string;
  calendarMonth: string;
  cancelReschedule: () => void;
  dateStripDays: string[];
  id: string;
  labelledBy: string;
  loadSlots: () => void;
  locale: Locale;
  morningSlots: Slot[];
  afternoonSlots: Slot[];
  readOnly?: boolean;
  requestBooking: (slot: Slot) => void;
  reschedulingAppointment: Appointment | null;
  saving: boolean;
  selectableServices: Service[];
  selectedDate: string;
  selectedServiceId: string;
  selectedWorker: Worker | undefined;
  selectedWorkerId: string;
  selectCalendarDate: (date: string) => void;
  selectStripDate: (date: string) => void;
  services: Service[];
  setCalendarMonth: (date: string) => void;
  setSelectedServiceId: (serviceId: string) => void;
  setSelectedWorkerId: (workerId: string) => void;
  slotActionLabel: string;
  slotCountsByDate: SlotCountsByDate;
  slotsForSelectedDate: Slot[];
  slotUserCanBook: boolean;
  subtitle: string;
  title: string;
  user: User | null;
  workers: Worker[];
};

export function BookingPanel({
  appointmentFormatter,
  bookingMaxDate,
  bookingMinDate,
  calendarMonth,
  cancelReschedule,
  dateStripDays,
  id,
  labelledBy,
  loadSlots,
  locale,
  morningSlots,
  afternoonSlots,
  readOnly = false,
  requestBooking,
  reschedulingAppointment,
  saving,
  selectableServices,
  selectedDate,
  selectedServiceId,
  selectedWorker,
  selectedWorkerId,
  selectCalendarDate,
  selectStripDate,
  services,
  setCalendarMonth,
  setSelectedServiceId,
  setSelectedWorkerId,
  slotActionLabel,
  slotCountsByDate,
  slotsForSelectedDate,
  slotUserCanBook,
  subtitle,
  title,
  user,
  workers,
}: BookingPanelProps) {
  const t = useTranslations();

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
            disabled={!selectableServices.length || (!readOnly && Boolean(reschedulingAppointment))}
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
