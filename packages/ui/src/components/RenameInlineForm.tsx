import type { TranslateFn } from "../types/translations";

type RenameInlineFormProps = {
  t: TranslateFn;
  keyName: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onApply: () => void;
  onCancel: () => void;
};

export default function RenameInlineForm({
  t,
  keyName,
  value,
  error,
  onChange,
  onApply,
  onCancel,
}: RenameInlineFormProps) {
  return (
    <div className="rename-form">
      <input
        aria-label={`${t("rename")} ${keyName}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="btn btn--primary btn--small row-action-icon-btn"
        aria-label={t("apply")}
        title={t("apply")}
        onClick={onApply}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M20.29 5.71a1 1 0 0 0-1.41-1.41L9 14.17l-3.88-3.88a1 1 0 0 0-1.41 1.41l4.59 4.59a1 1 0 0 0 1.41 0l10.58-10.58Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--small row-action-icon-btn"
        aria-label={t("cancel")}
        title={t("cancel")}
        onClick={onCancel}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M6.71 5.29a1 1 0 0 0-1.42 1.42L10.59 12l-5.3 5.29a1 1 0 1 0 1.42 1.42L12 13.41l5.29 5.3a1 1 0 0 0 1.42-1.42L13.41 12l5.3-5.29a1 1 0 0 0-1.42-1.42L12 10.59 6.71 5.29Z"
            fill="currentColor"
          />
        </svg>
      </button>
      {error && <span className="inline-error">{error}</span>}
    </div>
  );
}
