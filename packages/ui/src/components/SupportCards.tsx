import type { TranslateFn } from "../types/translations";

type SupportCardsProps = {
  t: TranslateFn;
};

export default function SupportCards({ t }: SupportCardsProps) {
  return (
    <section className="support-cards">
      <article className="support-card">
        <h2>{t("builtPublicTitle")}</h2>
        <p>{t("builtPublicBody")}</p>
      </article>
      <article className="support-card">
        <h2>{t("supportTitle")}</h2>
        <p>{t("supportBody")}</p>
      </article>
    </section>
  );
}
