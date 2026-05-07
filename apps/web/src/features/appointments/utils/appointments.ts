import type { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import type { Appointment, Role, Service, Worker, WorkerDayForm } from "../types";
import { calendarDate, formatDateTime } from "./date";

export function serviceName(service: Service, locale: Locale) {
  return service.name[locale] ?? service.name.en ?? service.id;
}

export function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function appointmentLocation(appointment: Appointment) {
  return appointment.location ?? appointment.worker.location;
}

export function appointmentStartsWithinHours(appointment: Appointment, hours: number) {
  const startsInMs = new Date(appointment.startsAt).getTime() - Date.now();
  return startsInMs < hours * 60 * 60 * 1000;
}

export function calendarHref(appointment: Appointment, locale: Locale) {
  const service = serviceName(appointment.service, locale);
  const summary = `${service} - ${appointment.worker.name}`;
  const description =
    locale === "fi"
      ? `Vastaanotto: ${service}\\nAmmattilainen: ${appointment.worker.name}`
      : `Appointment: ${service}\\nClinician: ${appointment.worker.name}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Appointment App//EN",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@appointment-app`,
    `DTSTAMP:${calendarDate(new Date().toISOString())}`,
    `DTSTART:${calendarDate(appointment.startsAt)}`,
    `DTEND:${calendarDate(appointment.endsAt)}`,
    `SUMMARY:${escapeCalendarText(summary)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `LOCATION:${escapeCalendarText(appointmentLocation(appointment))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export function roleLabel(role: Role, t: ReturnType<typeof useTranslations>) {
  if (role === "ADMIN") return t("roles.admin");
  if (role === "WORKER") return t("roles.worker");
  return t("roles.patient");
}

export function servicesForWorker(worker: Worker | undefined, fallbackServices: Service[]) {
  if (!worker) return fallbackServices;
  const activeCatalogIds = new Set(fallbackServices.map((service) => service.id));
  return worker.services.filter(
    (service) =>
      service.active && (activeCatalogIds.size === 0 || activeCatalogIds.has(service.id)),
  );
}

export function defaultServiceIdForWorker(worker: Worker | undefined, fallbackServices: Service[]) {
  return servicesForWorker(worker, fallbackServices)[0]?.id ?? "";
}

export function workerSupportsService(
  worker: Worker | undefined,
  serviceId: string,
  fallbackServices: Service[],
) {
  if (!serviceId) return false;
  return Boolean(
    servicesForWorker(worker, fallbackServices).some((service) => service.id === serviceId),
  );
}

export function defaultWorkerDayForms(location = "Main clinic"): WorkerDayForm[] {
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    active: weekday >= 1 && weekday <= 5,
    start: "09:00",
    end: "16:00",
    location,
  }));
}

export function appointmentFormatter(locale: Locale) {
  return (appointment: Appointment) =>
    `${formatDateTime(appointment.startsAt, locale, appointment.worker.timezone)} - ${serviceName(
      appointment.service,
      locale,
    )}`;
}
