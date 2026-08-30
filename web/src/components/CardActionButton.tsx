import { useState, type MouseEvent, type ReactNode } from "react";

type CardActionButtonProps = {
  className: string;
  "aria-label": string;
  disabled?: boolean;
  onClick: () => void | Promise<unknown>;
  onTriggered?: () => void;
  menuLabel?: string;
  children: ReactNode;
};

export function CardActionButton({
  className,
  "aria-label": label,
  disabled = false,
  onClick,
  onTriggered,
  menuLabel,
  children,
}: CardActionButtonProps) {
  const [isPending, setIsPending] = useState(false);

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    onTriggered?.();
    setIsPending(true);

    try {
      await onClick();
    } catch {
      // The owning mutation reports the failure through the shared snackbar.
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      className={`${className} note-card__action${isPending ? " is-pending" : ""}`}
      type="button"
      aria-label={label}
      aria-busy={isPending || undefined}
      data-tooltip={isPending ? "처리 중" : label}
      disabled={disabled || isPending}
      onClick={handleClick}
    >
      {isPending ? <span className="card-action-spinner" aria-hidden="true" /> : children}
      {menuLabel && <span className="note-card__action-label">{menuLabel}</span>}
    </button>
  );
}
