import type { Appointment, AvailabilityWindow, TimeOff } from "./generated/prisma/client.js";

export const slotStepMinutes = 15;
export const bookingHorizonDays = 90;
export const patientCancellationCutoffHours = 24;

export type Slot = {
  startsAt: Date;
  endsAt: Date;
};

type TimeRange = {
  startsAt: Date;
  endsAt: Date;
};

const weekdayByShortName: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function overlaps(left: TimeRange, right: TimeRange) {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

export function assertSlotIncrement(date: Date) {
  return (
    date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0 && date.getUTCMinutes() % 15 === 0
  );
}

function timeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`Missing ${type} for ${timeZone}`);
    return value;
  };

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdayByShortName[get("weekday")] ?? 0,
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

export function zonedTimeToUtc(input: {
  year: number;
  month: number;
  day: number;
  minuteOfDay: number;
  timeZone: string;
}) {
  const hour = Math.floor(input.minuteOfDay / 60);
  const minute = input.minuteOfDay % 60;
  const utcGuess = Date.UTC(input.year, input.month - 1, input.day, hour, minute, 0, 0);
  const firstOffset = getOffsetMinutes(new Date(utcGuess), input.timeZone);
  const firstUtc = utcGuess - firstOffset * 60_000;
  const secondOffset = getOffsetMinutes(new Date(firstUtc), input.timeZone);
  return new Date(utcGuess - secondOffset * 60_000);
}

function utcDayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function generateSlots(input: {
  from: Date;
  to: Date;
  timeZone: string;
  durationMinutes: number;
  availability: Pick<AvailabilityWindow, "weekday" | "startMinute" | "endMinute" | "active">[];
  timeOff: Pick<TimeOff, "startsAt" | "endsAt">[];
  booked: Pick<Appointment, "startsAt" | "endsAt">[];
}) {
  const slots: Slot[] = [];
  const start = utcDayStart(input.from);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = utcDayStart(input.to);
  end.setUTCDate(end.getUTCDate() + 1);

  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const localNoon = new Date(day);
    localNoon.setUTCHours(12, 0, 0, 0);
    const parts = timeZoneParts(localNoon, input.timeZone);
    const windows = input.availability.filter(
      (window) => window.active && window.weekday === parts.weekday,
    );

    for (const window of windows) {
      const lastStart = window.endMinute - input.durationMinutes;
      for (let minute = window.startMinute; minute <= lastStart; minute += slotStepMinutes) {
        const startsAt = zonedTimeToUtc({
          year: parts.year,
          month: parts.month,
          day: parts.day,
          minuteOfDay: minute,
          timeZone: input.timeZone,
        });
        const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
        const candidate = { startsAt, endsAt };

        if (startsAt < input.from || endsAt > input.to) continue;
        if (input.timeOff.some((blocked) => overlaps(candidate, blocked))) continue;
        if (input.booked.some((booked) => overlaps(candidate, booked))) continue;

        slots.push(candidate);
      }
    }
  }

  return slots.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}
