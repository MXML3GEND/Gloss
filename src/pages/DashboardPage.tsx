const t = (key: string) => key;
const translate = (key: string) => key;

export function DashboardPage() {
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
    t("dashboard.actions.cancel"),
    t("dashboard.actions.primary"),
    t("dashboard.actions.secondary"),
    t("analytics.actions.cancel"),
    t("analytics.actions.primary"),
    t("analytics.actions.secondary"),
    t("notifications.actions.cancel"),
    t("notifications.actions.primary"),
    t("notifications.actions.secondary"),
    t("dashboard.panels.performanceInsight"),
    t("auth.login.submit"),
    t("auth.login.submit"),
  ];

  const statusLine = true
    ? t("auth.login.submit")
    : t("dashboard.stats.totalUsers");

  return { heading, labels, statusLine };
}
