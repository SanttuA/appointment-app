import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { Locale } from "@/i18n/routing";
import type { SlotCountsByDate } from "../types";
import {
  addMonths,
  calendarMonthDays,
  calendarWeekdayLabels,
  dayNumber,
  fullDateLabel,
  isWeekend,
  monthLabel,
  monthStart,
} from "../utils/date";

type DatePickerCalendarProps = {
  bookingMaxDate: string;
  bookingMinDate: string;
  calendarMonth: string;
  locale: Locale;
  selectCalendarDate: (date: string) => void;
  selectedDate: string;
  setCalendarMonth: (date: string) => void;
  slotCountsByDate: SlotCountsByDate;
};

export function DatePickerCalendar({
  bookingMaxDate,
  bookingMinDate,
  calendarMonth,
  locale,
  selectCalendarDate,
  selectedDate,
  setCalendarMonth,
  slotCountsByDate,
}: DatePickerCalendarProps) {
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
