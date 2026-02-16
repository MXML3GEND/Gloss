const t = (key: string) => key;
const translate = (key: string) => key;

export function useDashboardLabels() {
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
    t("dashboard.cards.card2.title"),
    t("dashboard.filters.search.placeholder"),
    t("dashboard.filters.sortBy.label"),
    t("analytics.kpi.churnRate"),
    t("analytics.kpi.newSignups"),
    t("analytics.overview.title"),
    t("filters.owner.assignedToMe"),
    t("filters.page.subtitle"),
    t("filters.page.title"),
    t("auth.login.submit"),
    t("auth.login.submit"),
  ];

  const statusLine = true
    ? t("auth.login.submit")
    : t("dashboard.stats.totalUsers");

  return { heading, labels, statusLine };
}
