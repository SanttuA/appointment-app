import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent, Ref } from "react";
import type { AdminDrawer, AdminServiceForm, AdminUserForm, Role, User } from "../types";
import { AppDialog } from "./AppDialog";

type AdminManagementDrawerProps = {
  adminDrawer: AdminDrawer | null;
  adminDrawerCloseButtonRef: Ref<HTMLButtonElement>;
  adminServiceForm: AdminServiceForm;
  adminUserForm: AdminUserForm;
  adminUsers: User[];
  closeAdminDrawer: () => void;
  saving: boolean;
  submitAdminService: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  submitAdminUser: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  updateAdminServiceForm: (patch: Partial<AdminServiceForm>) => void;
  updateAdminUserForm: (patch: Partial<AdminUserForm>) => void;
  user: User | null;
};

export function AdminManagementDrawer({
  adminDrawer,
  adminDrawerCloseButtonRef,
  adminServiceForm,
  adminUserForm,
  adminUsers,
  closeAdminDrawer,
  saving,
  submitAdminService,
  submitAdminUser,
  updateAdminServiceForm,
  updateAdminUserForm,
  user,
}: AdminManagementDrawerProps) {
  const t = useTranslations();

  if (!adminDrawer) return null;

  const editingUser =
    adminDrawer.type === "user" && adminDrawer.mode === "edit"
      ? adminUsers.find((adminUser) => adminUser.id === adminDrawer.userId)
      : null;
  const editingCurrentUser = Boolean(editingUser && editingUser.id === user?.id);
  const title =
    adminDrawer.type === "user"
      ? adminDrawer.mode === "edit"
        ? t("admin.users.edit")
        : t("admin.users.add")
      : adminDrawer.mode === "edit"
        ? t("admin.services.edit")
        : t("admin.services.add");

  return (
    <AppDialog
      backdropClassName="fixed inset-0 z-30 bg-slate-950/40"
      className="surface ml-auto flex h-full w-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden rounded-none border-y-0 border-r-0 shadow-xl"
      labelledBy="admin-drawer-title"
      onClose={closeAdminDrawer}
      testId="admin-drawer-backdrop"
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-5">
        <div>
          <h2 className="text-xl font-bold" id="admin-drawer-title">
            {title}
          </h2>
          <p className="muted mt-1 text-sm">
            {adminDrawer.type === "user"
              ? t("admin.users.drawerSubtitle")
              : t("admin.services.drawerSubtitle")}
          </p>
        </div>
        <button
          aria-label={t("admin.drawer.close")}
          className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)]"
          disabled={saving}
          onClick={closeAdminDrawer}
          ref={adminDrawerCloseButtonRef}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      {adminDrawer.type === "user" ? (
        <form
          className="grid flex-1 content-start gap-4 overflow-auto p-5"
          onSubmit={submitAdminUser}
        >
          <label className="field">
            <span>{t("fields.name")}</span>
            <input
              onChange={(event) => updateAdminUserForm({ name: event.target.value })}
              required
              value={adminUserForm.name}
            />
          </label>
          <label className="field">
            <span>{t("fields.email")}</span>
            <input
              disabled={adminDrawer.mode === "edit"}
              onChange={(event) => updateAdminUserForm({ email: event.target.value })}
              required
              type="email"
              value={adminUserForm.email}
            />
          </label>
          <label className="field">
            <span>{t("fields.phone")}</span>
            <input
              onChange={(event) => updateAdminUserForm({ phone: event.target.value })}
              value={adminUserForm.phone}
            />
          </label>
          <label className="field">
            <span>{t("fields.role")}</span>
            <select
              disabled={adminDrawer.mode === "edit"}
              onChange={(event) => updateAdminUserForm({ role: event.target.value as Role })}
              value={adminUserForm.role}
            >
              <option value="PATIENT">{t("roles.patient")}</option>
              <option value="WORKER">{t("roles.worker")}</option>
              <option value="ADMIN">{t("roles.admin")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("fields.locale")}</span>
            <select
              onChange={(event) =>
                updateAdminUserForm({ preferredLocale: event.target.value as "en" | "fi" })
              }
              value={adminUserForm.preferredLocale}
            >
              <option value="en">English</option>
              <option value="fi">Suomi</option>
            </select>
          </label>
          {adminUserForm.role === "WORKER" ? (
            <label className="field">
              <span>{t("fields.location")}</span>
              <input
                disabled={adminDrawer.mode === "edit"}
                onChange={(event) => updateAdminUserForm({ workerLocation: event.target.value })}
                required={adminDrawer.mode === "create"}
                value={adminUserForm.workerLocation}
              />
            </label>
          ) : null}
          {adminDrawer.mode === "edit" ? (
            <label className="flex items-center gap-2 font-semibold">
              <input
                checked={adminUserForm.active}
                disabled={editingCurrentUser}
                onChange={(event) => updateAdminUserForm({ active: event.target.checked })}
                type="checkbox"
              />
              {t("admin.status.active")}
            </label>
          ) : null}
          {editingCurrentUser ? (
            <p className="muted text-sm">{t("admin.users.currentUser")}</p>
          ) : null}
          <button className="btn-primary" disabled={saving} type="submit">
            {adminDrawer.mode === "edit" ? t("admin.users.saveEdit") : t("admin.users.saveNew")}
          </button>
        </form>
      ) : (
        <form
          className="grid flex-1 content-start gap-4 overflow-auto p-5"
          onSubmit={submitAdminService}
        >
          <label className="field">
            <span>{t("admin.serviceNameEn")}</span>
            <input
              onChange={(event) => updateAdminServiceForm({ nameEn: event.target.value })}
              required
              value={adminServiceForm.nameEn}
            />
          </label>
          <label className="field">
            <span>{t("admin.serviceNameFi")}</span>
            <input
              onChange={(event) => updateAdminServiceForm({ nameFi: event.target.value })}
              required
              value={adminServiceForm.nameFi}
            />
          </label>
          <label className="field">
            <span>{t("admin.services.descriptionEn")}</span>
            <textarea
              onChange={(event) => updateAdminServiceForm({ descriptionEn: event.target.value })}
              rows={3}
              value={adminServiceForm.descriptionEn}
            />
          </label>
          <label className="field">
            <span>{t("admin.services.descriptionFi")}</span>
            <textarea
              onChange={(event) => updateAdminServiceForm({ descriptionFi: event.target.value })}
              rows={3}
              value={adminServiceForm.descriptionFi}
            />
          </label>
          <label className="flex items-center gap-2 font-semibold">
            <input
              checked={adminServiceForm.active}
              onChange={(event) => updateAdminServiceForm({ active: event.target.checked })}
              type="checkbox"
            />
            {t("admin.status.active")}
          </label>
          <button className="btn-primary" disabled={saving} type="submit">
            {adminDrawer.mode === "edit"
              ? t("admin.services.saveEdit")
              : t("admin.services.saveNew")}
          </button>
        </form>
      )}
    </AppDialog>
  );
}
