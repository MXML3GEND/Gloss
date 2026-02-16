import type { FormEvent } from "react";
import { useEffect, useRef } from "react";
import type { ModalDialogState } from "../hooks/useModalDialog";

type ModalDialogProps = {
  dialog: ModalDialogState;
  onCancel: () => void;
  onConfirm: () => void;
  onPromptValueChange: (value: string) => void;
};

export default function ModalDialog({
  dialog,
  onCancel,
  onConfirm,
  onPromptValueChange,
}: ModalDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (dialog?.type === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [dialog]);

  if (!dialog) {
    return null;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm();
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="modal-dialog__message">{dialog.message}</p>

        {dialog.type === "prompt" && (
          <input
            ref={inputRef}
            value={dialog.value}
            placeholder={dialog.placeholder}
            onChange={(event) => onPromptValueChange(event.target.value)}
          />
        )}

        <div className="modal-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {dialog.cancelLabel}
          </button>
          <button
            type="submit"
            className={
              dialog.type === "confirm" && dialog.tone === "danger"
                ? "btn btn--danger"
                : "btn btn--primary"
            }
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
