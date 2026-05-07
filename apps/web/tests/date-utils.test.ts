import { describe, expect, it } from "vitest";
import {
  addDays,
  centerDateStripStart,
  formatDateKey,
  inputDateMinuteInTimeZone,
  inputDateStartInTimeZone,
  monthStart,
  timeToMinute,
  weekStartMonday,
} from "../src/features/appointments/utils/date";

describe("appointment date utilities", () => {
  it("keeps input-date arithmetic stable across month boundaries", () => {
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
    expect(monthStart("2026-05-31")).toBe("2026-05-01");
    expect(weekStartMonday("2026-05-10")).toBe("2026-05-04");
  });

  it("centers the date strip while respecting booking bounds", () => {
    expect(centerDateStripStart("2026-05-10", "2026-05-04", "2026-08-01")).toBe("2026-05-04");
    expect(centerDateStripStart("2026-07-31", "2026-05-04", "2026-08-01")).toBe("2026-07-19");
  });

  it("converts worker-local dates and times to UTC instants", () => {
    expect(inputDateStartInTimeZone("2026-05-04", "Europe/Helsinki").toISOString()).toBe(
      "2026-05-03T21:00:00.000Z",
    );
    expect(
      inputDateMinuteInTimeZone(
        "2026-05-04",
        timeToMinute("09:30"),
        "Europe/Helsinki",
      ).toISOString(),
    ).toBe("2026-05-04T06:30:00.000Z");
  });

  it("formats date keys in the requested timezone", () => {
    expect(formatDateKey("2026-05-03T21:30:00.000Z", "Europe/Helsinki")).toBe("2026-05-04");
    expect(formatDateKey("2026-05-03T21:30:00.000Z", "UTC")).toBe("2026-05-03");
  });
});
