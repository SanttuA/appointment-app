import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Dispatch, FormEvent, Ref, SetStateAction } from "react";
import { AppDialog } from "./AppDialog";

type BlockTimeDialogProps = {
  blockDate: string;
  blockDialogOpen: boolean;
  blockEnd: string;
  blockFirstFieldRef: Ref<HTMLInputElement>;
  blockReason: string;
  blockStart: string;
  closeBlockDialog: () => void;
  createBlockTime: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  setBlockDate: Dispatch<SetStateAction<string>>;
  setBlockEnd: Dispatch<SetStateAction<string>>;
  setBlockReason: Dispatch<SetStateAction<string>>;
  setBlockStart: Dispatch<SetStateAction<string>>;
};

export function BlockTimeDialog({
  blockDate,
  blockDialogOpen,
  blockEnd,
  blockFirstFieldRef,
  blockReason,
  blockStart,
  closeBlockDialog,
  createBlockTime,
  saving,
  setBlockDate,
  setBlockEnd,
  setBlockReason,
  setBlockStart,
}: BlockTimeDialogProps) {
  const t = useTranslations();

  if (!blockDialogOpen) return null;

  return (
    <AppDialog
      backdropClassName="fixed inset-0 z-30 grid place-items-center bg-slate-950/50 px-4 py-6"
      className="surface max-h-full w-full max-w-md overflow-auto p-5 shadow-xl"
      labelledBy="block-dialog-title"
      onClose={closeBlockDialog}
      testId="block-dialog-backdrop"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold" id="block-dialog-title">
            {t("worker.block.title")}
          </h2>
          <p className="muted mt-1 text-sm">{t("worker.block.subtitle")}</p>
        </div>
        <button
          aria-label={t("auth.close")}
          className="grid h-10 w-10 place-items-center rounded-md border border-[var(--line)] bg-white text-[var(--foreground)]"
          disabled={saving}
          onClick={closeBlockDialog}
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      <form className="mt-5 grid gap-4" onSubmit={createBlockTime}>
        <label className="field">
          <span>{t("fields.startDate")}</span>
          <input
            onChange={(event) => setBlockDate(event.target.value)}
            ref={blockFirstFieldRef}
            required
            type="date"
            value={blockDate}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field">
            <span>{t("worker.block.from")}</span>
            <input
              onChange={(event) => setBlockStart(event.target.value)}
              required
              step={900}
              type="time"
              value={blockStart}
            />
          </label>
          <label className="field">
            <span>{t("worker.block.to")}</span>
            <input
              onChange={(event) => setBlockEnd(event.target.value)}
              required
              step={900}
              type="time"
              value={blockEnd}
            />
          </label>
        </div>
        <label className="field">
          <span>{t("worker.block.reason")}</span>
          <input onChange={(event) => setBlockReason(event.target.value)} value={blockReason} />
        </label>
        <button className="btn-primary" disabled={saving} type="submit">
          {t("worker.block.save")}
        </button>
      </form>
    </AppDialog>
  );
}
