import type { Locale } from "@/i18n/routing";
import { dateStripCenterOffset, dateStripDayCount } from "../constants";

export function formatLocalInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function tomorrowInputDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatLocalInputDate(date);
}

export function inputDateToUtcDate(inputDate: string) {
  return new Date(`${inputDate}T00:00:00.000Z`);
}

export function parseInputDate(inputDate: string) {
  const [year, month, day] = inputDate.split("-").map(Number);
  return { day: day ?? 1, month: month ?? 1, year: year ?? 1970 };
}

function timeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
  const entries = formatter
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]);
  const parts = Object.fromEntries(entries) as Record<Intl.DateTimeFormatPartTypes, number>;
  return {
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    month: parts.month ?? 1,
    second: parts.second ?? 0,
    year: parts.year ?? 1970,
  };
}

function getOffsetMinutes(date: Date, timeZone: string) {
  const parts = timeZoneParts(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return (localAsUtc - date.getTime()) / 60_000;
}

export function inputDateStartInTimeZone(inputDate: string, timeZone: string) {
  const { day, month, year } = parseInputDate(inputDate);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const firstOffset = getOffsetMinutes(new Date(utcGuess), timeZone);
  const firstUtc = utcGuess - firstOffset * 60_000;
  const secondOffset = getOffsetMinutes(new Date(firstUtc), timeZone);
  return new Date(utcGuess - secondOffset * 60_000);
}

export function addDays(inputDate: string, days: number) {
  const date = inputDateToUtcDate(inputDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function clampInputDate(inputDate: string, minDate: string, maxDate: string) {
  if (inputDate < minDate) return minDate;
  if (inputDate > maxDate) return maxDate;
  return inputDate;
}

export function monthStart(inputDate: string) {
  const date = inputDateToUtcDate(inputDate);
  date.setUTCDate(1);
  return date.toISOString().slice(0, 10);
}

export function addMonths(inputDate: string, months: number) {
  const date = inputDateToUtcDate(monthStart(inputDate));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function calendarMonthDays(inputDate: string) {
  const start = inputDateToUtcDate(monthStart(inputDate));
  const leadingDays = (start.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(start.getUTCFullYear(), start.getUTCMonth() + 1, 0).getUTCDate();
  const days: (string | null)[] = Array.from({ length: leadingDays }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
    days.push(date.toISOString().slice(0, 10));
  }
  while (days.length % 7 !== 0) {
    days.push(null);
  }
  return days;
}

export function calendarWeekdayLabels(locale: Locale) {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
      timeZone: "UTC",
      weekday: "short",
    }).format(new Date(Date.UTC(2026, 4, 4 + index))),
  );
}

export function monthLabel(inputDate: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(inputDateToUtcDate(inputDate));
}

export function fullDateLabel(inputDate: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(inputDateToUtcDate(inputDate));
}

export function centerDateStripStart(inputDate: string, minDate: string, maxDate: string) {
  const centeredStart = addDays(inputDate, -dateStripCenterOffset);
  const maxStripStart = addDays(maxDate, -(dateStripDayCount - 1));
  return clampInputDate(centeredStart, minDate, maxStripStart);
}

export function formatDateTime(value: string, locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function formatTime(value: string, locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function formatDateKey(value: string | Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function localHour(value: string, timeZone?: string) {
  const part = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone,
  })
    .formatToParts(new Date(value))
    .find((item) => item.type === "hour")?.value;
  return Number(part ?? 0);
}

export function weekdayLabel(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(inputDateToUtcDate(value));
}

export function dayNumber(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone: "UTC",
  }).format(inputDateToUtcDate(value));
}

export function isWeekend(value: string) {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

export function calendarDate(value: string) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function timeToMinute(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export function minuteToTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function inputDateMinuteInTimeZone(
  inputDate: string,
  minuteOfDay: number,
  timeZone: string,
) {
  const { day, month, year } = parseInputDate(inputDate);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstOffset = getOffsetMinutes(new Date(utcGuess), timeZone);
  const firstUtc = utcGuess - firstOffset * 60_000;
  const secondOffset = getOffsetMinutes(new Date(firstUtc), timeZone);
  return new Date(utcGuess - secondOffset * 60_000);
}

export function weekStartMonday(inputDate: string) {
  const date = inputDateToUtcDate(inputDate);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function ceilToSlotStep(minutes: number) {
  return Math.ceil(minutes / 15) * 15;
}
