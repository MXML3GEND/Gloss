import type { TranslateFn } from "../types/translations";

type FooterActionsProps = {
  t: TranslateFn;
  saving: boolean;
  disabled: boolean;
  onSave: () => void;
};

export default function FooterActions({
  t,
  saving,
  disabled,
  onSave,
}: FooterActionsProps) {
  return (
    <div className="footer-actions">
      <button className="btn btn--primary" onClick={onSave} disabled={disabled}>
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}
