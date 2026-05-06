import { describe, expect, it } from "vitest";
import {
  appointmentHasStarted,
  bufferedConflictLookupRange,
  generateScheduleSlots,
  generateSlots,
  overlaps,
} from "../src/scheduling.js";

describe("scheduling", () => {
  it("detects overlapping appointment ranges", () => {
    expect(
      overlaps(
        {
          startsAt: new Date("2026-05-04T09:00:00.000Z"),
          endsAt: new Date("2026-05-04T09:30:00.000Z"),
        },
        {
          startsAt: new Date("2026-05-04T09:15:00.000Z"),
          endsAt: new Date("2026-05-04T09:45:00.000Z"),
        },
      ),
    ).toBe(true);
  });

  it("generates appointment-duration slots from worker availability and excludes booked time", () => {
    const slots = generateSlots({
      from: new Date("2026-05-04T06:00:00.000Z"),
      to: new Date("2026-05-04T09:00:00.000Z"),
      timeZone: "Europe/Helsinki",
      durationMinutes: 30,
      availability: [
        {
          weekday: 1,
          startMinute: 9 * 60,
          endMinute: 11 * 60,
          location: "Main clinic",
          active: true,
        },
      ],
      timeOff: [],
      booked: [
        {
          startsAt: new Date("2026-05-04T06:30:00.000Z"),
          endsAt: new Date("2026-05-04T07:00:00.000Z"),
        },
      ],
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-05-04T06:00:00.000Z",
      "2026-05-04T07:00:00.000Z",
      "2026-05-04T07:30:00.000Z",
    ]);
    expect(slots[0]?.location).toBe("Main clinic");
  });

  it("can include taken candidates for a visible schedule", () => {
    const slots = generateScheduleSlots({
      from: new Date("2026-05-04T06:00:00.000Z"),
      to: new Date("2026-05-04T08:00:00.000Z"),
      timeZone: "Europe/Helsinki",
      durationMinutes: 30,
      availability: [
        {
          weekday: 1,
          startMinute: 9 * 60,
          endMinute: 11 * 60,
          location: "Main clinic",
          active: true,
        },
      ],
      timeOff: [],
      booked: [
        {
          startsAt: new Date("2026-05-04T06:30:00.000Z"),
          endsAt: new Date("2026-05-04T07:00:00.000Z"),
        },
      ],
    });

    expect(
      slots.map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        status: slot.status,
      })),
    ).toEqual([
      { startsAt: "2026-05-04T06:00:00.000Z", status: "AVAILABLE" },
      { startsAt: "2026-05-04T06:30:00.000Z", status: "TAKEN" },
      { startsAt: "2026-05-04T07:00:00.000Z", status: "AVAILABLE" },
      { startsAt: "2026-05-04T07:30:00.000Z", status: "AVAILABLE" },
    ]);
  });

  it("uses buffer time to advance generated starts and block after booked appointments", () => {
    const slots = generateScheduleSlots({
      from: new Date("2026-05-04T06:00:00.000Z"),
      to: new Date("2026-05-04T09:00:00.000Z"),
      timeZone: "Europe/Helsinki",
      durationMinutes: 30,
      bufferMinutes: 10,
      availability: [
        {
          weekday: 1,
          startMinute: 9 * 60,
          endMinute: 12 * 60,
          location: "East clinic",
          active: true,
        },
      ],
      timeOff: [],
      booked: [
        {
          startsAt: new Date("2026-05-04T06:00:00.000Z"),
          endsAt: new Date("2026-05-04T06:30:00.000Z"),
        },
        {
          startsAt: new Date("2026-05-04T08:00:00.000Z"),
          endsAt: new Date("2026-05-04T08:30:00.000Z"),
        },
      ],
    });

    expect(
      slots.map((slot) => ({
        location: slot.location,
        startsAt: slot.startsAt.toISOString(),
        status: slot.status,
      })),
    ).toEqual([
      { startsAt: "2026-05-04T06:00:00.000Z", status: "TAKEN", location: "East clinic" },
      { startsAt: "2026-05-04T06:45:00.000Z", status: "AVAILABLE", location: "East clinic" },
      { startsAt: "2026-05-04T07:30:00.000Z", status: "TAKEN", location: "East clinic" },
      { startsAt: "2026-05-04T08:15:00.000Z", status: "TAKEN", location: "East clinic" },
    ]);
  });

  it("widens conflict lookup ranges enough to include buffer-adjacent appointments", () => {
    const requestedSlot = {
      startsAt: new Date("2026-05-04T07:30:00.000Z"),
      endsAt: new Date("2026-05-04T08:00:00.000Z"),
    };
    const previousAppointment = {
      startsAt: new Date("2026-05-04T07:00:00.000Z"),
      endsAt: new Date("2026-05-04T07:30:00.000Z"),
    };
    const nextAppointment = {
      startsAt: new Date("2026-05-04T08:00:00.000Z"),
      endsAt: new Date("2026-05-04T08:30:00.000Z"),
    };

    const lookupRange = bufferedConflictLookupRange(requestedSlot, 10);

    expect(lookupRange.startsAt.toISOString()).toBe("2026-05-04T07:20:00.000Z");
    expect(lookupRange.endsAt.toISOString()).toBe("2026-05-04T08:10:00.000Z");
    expect(overlaps(lookupRange, previousAppointment)).toBe(true);
    expect(overlaps(lookupRange, nextAppointment)).toBe(true);
    expect(
      generateSlots({
        from: requestedSlot.startsAt,
        to: requestedSlot.endsAt,
        timeZone: "Europe/Helsinki",
        durationMinutes: 30,
        bufferMinutes: 10,
        availability: [
          {
            weekday: 1,
            startMinute: 10 * 60 + 30,
            endMinute: 11 * 60,
            location: "Main clinic",
            active: true,
          },
        ],
        timeOff: [],
        booked: [previousAppointment],
      }),
    ).toEqual([]);
  });

  it("only allows status completion transitions once an appointment has started", () => {
    const now = new Date("2026-05-04T09:00:00.000Z");

    expect(appointmentHasStarted({ startsAt: new Date("2026-05-04T08:59:59.000Z") }, now)).toBe(
      true,
    );
    expect(appointmentHasStarted({ startsAt: new Date("2026-05-04T09:00:00.000Z") }, now)).toBe(
      true,
    );
    expect(appointmentHasStarted({ startsAt: new Date("2026-05-04T09:00:01.000Z") }, now)).toBe(
      false,
    );
  });
});
