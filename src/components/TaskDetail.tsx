const t = (key: string) => key;
const translate = (key: string) => key;

export function TaskDetail() {
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
    t("tasks.cards.card2.description"),
    t("tasks.cards.card2.title"),
    t("tasks.detail.assignedTo"),
    t("projects.filters.sortBy.label"),
    t("projects.list.empty"),
    t("projects.list.title"),
    t("modals.actions.cancel"),
    t("modals.actions.primary"),
    t("modals.actions.secondary"),
    translate("analytics.kpi.timeToValue"),
    t("notifications.center.title"),
    t("notifications.center.title"),
  ];

  const statusLine = true
    ? t("notifications.center.title")
    : t("errors.network.timeout");

  return { heading, labels, statusLine };
}
