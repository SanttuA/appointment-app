import type { MouseEvent, ReactNode } from "react";

type AppDialogProps = {
  children: ReactNode;
  className: string;
  labelledBy: string;
  onClose: () => void;
  backdropClassName: string;
  describedBy?: string;
  testId: string;
};

export function AppDialog({
  backdropClassName,
  children,
  className,
  describedBy,
  labelledBy,
  onClose,
  testId,
}: AppDialogProps) {
  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    onClose();
  }

  return (
    <div className={backdropClassName} data-testid={testId} onClick={handleBackdropClick}>
      <section
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={className}
        role="dialog"
      >
        {children}
      </section>
    </div>
  );
}
