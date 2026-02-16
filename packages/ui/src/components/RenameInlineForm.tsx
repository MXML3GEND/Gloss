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
      <button type="button" className="btn btn--primary btn--small" onClick={onApply}>
        {t("apply")}
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>
        {t("cancel")}
      </button>
      {error && <span className="inline-error">{error}</span>}
    </div>
  );
}
