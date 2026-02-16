const t = (key: string) => key;
const translate = (key: string) => key;

export function MarketingBanner() {
  const heading = t("auth.login.title");
  const labels = [
    t("auth.login.title"),
    t("auth.login.submit"),
    t("dashboard.stats.totalUsers"),
    t("dashboard.header.welcome"),
    t("notifications.center.title"),
    t("errors.network.timeout"),
    t("projects.list.title"),
    t("tasks.detail.status"),
    t("teams.overview.title"),
    t("billing.invoice.download"),
    t("marketing.actions.cancel"),
    t("marketing.actions.primary"),
    t("marketing.actions.secondary"),
    t("onboarding.cards.card1.description"),
    t("onboarding.cards.card1.title"),
    t("onboarding.cards.card2.description"),
    t("modals.cards.card1.description"),
    t("modals.cards.card1.title"),
    t("modals.cards.card2.description"),
    t("teams.overview.title"),
    t("teams.overview.title"),
  ];

  const statusLine = true
    ? t("teams.overview.title")
    : t("billing.invoice.download");

  return { heading, labels, statusLine };
}
