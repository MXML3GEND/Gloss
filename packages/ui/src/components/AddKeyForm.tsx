import type { FormEvent } from "react";
import type { TranslateFn } from "../types/translations";

type AddKeyFormProps = {
  t: TranslateFn;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  disabled: boolean;
};

export default function AddKeyForm({
  t,
  value,
  error,
  onChange,
  onSubmit,
  disabled,
}: AddKeyFormProps) {
  return (
    <>
      <form className="add-key-form" onSubmit={onSubmit}>
        <input
          aria-label={t("newKeyPlaceholder")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("newKeyPlaceholder")}
        />
        <button type="submit" className="btn btn--primary" disabled={disabled}>
          {t("addKey")}
        </button>
      </form>
      {error && <p className="add-key-form__error">{error}</p>}
    </>
  );
}
