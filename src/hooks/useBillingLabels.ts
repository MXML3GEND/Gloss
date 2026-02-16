const t = (key: string) => key;
const translate = (key: string) => key;

export function useBillingLabels() {
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
    t("billing.cards.card2.title"),
    t("billing.filters.search.placeholder"),
    t("billing.filters.sortBy.label"),
    t("reports.page.title"),
    t("reports.schedule.daily"),
    t("reports.schedule.weekly"),
    t("notifications.preferences.email"),
    t("notifications.preferences.push"),
    t("notifications.status.empty"),
    t("dashboard.header.welcome"),
    t("dashboard.header.welcome"),
  ];

  const statusLine = true
    ? t("dashboard.header.welcome")
    : t("notifications.center.title");

  return { heading, labels, statusLine };
}
