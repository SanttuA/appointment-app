import { describe, expect, it } from "vitest";
import { generateSlots, overlaps } from "../src/scheduling.js";

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

  it("generates 15-minute slots from worker availability and excludes booked time", () => {
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
      "2026-05-04T07:15:00.000Z",
      "2026-05-04T07:30:00.000Z",
    ]);
  });
});
