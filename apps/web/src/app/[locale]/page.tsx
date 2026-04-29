import { setRequestLocale } from "next-intl/server";
import { AppointmentClient } from "@/components/AppointmentClient";
import type { Locale } from "@/i18n/routing";

export default async function LocaleHome(props: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return <AppointmentClient locale={locale} />;
}
