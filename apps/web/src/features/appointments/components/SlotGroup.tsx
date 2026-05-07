import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import type { Slot, User } from "../types";
import { formatTime } from "../utils/date";

type SlotGroupProps = {
  actionLabel: string;
  locale: Locale;
  requestBooking: (slot: Slot) => void;
  readOnly?: boolean;
  saving: boolean;
  slots: Slot[];
  timeZone: string | undefined;
  title: string;
  user: User | null;
  userCanBook: boolean;
};

export function SlotGroup({
  actionLabel,
  locale,
  requestBooking,
  readOnly = false,
  saving,
  slots,
  timeZone,
  title,
  user,
  userCanBook,
}: SlotGroupProps) {
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
              ) : readOnly ? (
                <span className="rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
                  {t("admin.booking.available")}
                </span>
              ) : (
                <button
                  className="btn-primary min-w-24"
                  disabled={(user !== null && !userCanBook) || saving}
                  onClick={() => requestBooking(slot)}
                  type="button"
                >
                  {actionLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
