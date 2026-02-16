const t = (key: string) => key;
const translate = (key: string) => key;

export function ReportsPage() {
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
    t("reports.cards.card1.description"),
    t("reports.cards.card1.title"),
    t("reports.cards.card2.description"),
    t("analytics.cards.card1.description"),
    t("analytics.cards.card1.title"),
    t("analytics.cards.card2.description"),
    t("table.actions.cancel"),
    t("table.actions.primary"),
    t("table.actions.secondary"),
    translate("onboarding.steps.security.title"),
    t("projects.list.title"),
    t("projects.list.title"),
  ];

  const statusLine = true
    ? t("projects.list.title")
    : t("tasks.detail.status");

  return { heading, labels, statusLine };
}
