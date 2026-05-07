import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Dispatch, FormEvent, Ref, SetStateAction } from "react";
import type { Locale } from "@/i18n/routing";
import type { BookingContext, Worker } from "../types";
import { formatDateTime } from "../utils/date";
import { AppDialog } from "./AppDialog";

type AuthDialogProps = {
  authDialogOpen: boolean;
  authError: string | null;
  authFirstFieldRef: Ref<HTMLInputElement>;
  authMode: "login" | "register";
  closeAuthDialog: () => void;
  email: string;
  errorMessage: (code: string) => string;
  locale: Locale;
  name: string;
  password: string;
  pendingBooking: BookingContext | null;
  pendingBookingWorker: Worker | undefined;
  saving: boolean;
  setAuthError: Dispatch<SetStateAction<string | null>>;
  setAuthMode: Dispatch<SetStateAction<"login" | "register">>;
  setEmail: Dispatch<SetStateAction<string>>;
  setName: Dispatch<SetStateAction<string>>;
  setPassword: Dispatch<SetStateAction<string>>;
  submitAuth: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function AuthDialog({
  authDialogOpen,
  authError,
  authFirstFieldRef,
  authMode,
  closeAuthDialog,
  email,
  errorMessage,
  locale,
  name,
  password,
  pendingBooking,
  pendingBookingWorker,
  saving,
  setAuthError,
  setAuthMode,
  setEmail,
  setName,
  setPassword,
  submitAuth,
}: AuthDialogProps) {
  const t = useTranslations();

  if (!authDialogOpen) return null;

  return (
    <AppDialog
      backdropClassName="fixed inset-0 z-30 grid place-items-center bg-slate-950/50 px-4 py-6"
      className="surface max-h-full w-full max-w-md overflow-auto p-5 shadow-xl"
      labelledBy="auth-dialog-title"
      onClose={closeAuthDialog}
      testId="auth-dialog-backdrop"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold" id="auth-dialog-title">
            {pendingBooking ? t("booking.signInToBook") : t("auth.account")}
          </h2>
          {pendingBooking ? (
            <p className="muted mt-1 text-sm">
              {formatDateTime(pendingBooking.slot.startsAt, locale, pendingBookingWorker?.timezone)}
            </p>
          ) : null}
        </div>
        <button
          aria-label={t("auth.close")}
          className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)]"
          disabled={saving}
          onClick={closeAuthDialog}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      <form className="mt-5 grid gap-4" onSubmit={submitAuth}>
        <div className="flex gap-2" aria-label={t("auth.mode")}>
          <button
            className={authMode === "login" ? "btn-primary" : "btn-secondary"}
            type="button"
            onClick={() => {
              setAuthMode("login");
              setAuthError(null);
            }}
          >
            {t("auth.login")}
          </button>
          <button
            className={authMode === "register" ? "btn-primary" : "btn-secondary"}
            type="button"
            onClick={() => {
              setAuthMode("register");
              setAuthError(null);
            }}
          >
            {t("auth.register")}
          </button>
        </div>
        {authMode === "register" ? (
          <label className="field">
            <span>{t("fields.name")}</span>
            <input
              ref={authFirstFieldRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
        ) : null}
        <label className="field">
          <span>{t("fields.email")}</span>
          <input
            ref={authMode === "login" ? authFirstFieldRef : undefined}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>{t("fields.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {authError ? (
          <p
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800"
            role="alert"
          >
            {errorMessage(authError)}
          </p>
        ) : null}
        <button className="btn-primary" type="submit" disabled={saving}>
          {authMode === "register" ? t("auth.createAccount") : t("auth.signIn")}
        </button>
      </form>
    </AppDialog>
  );
}
