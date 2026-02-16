const t = (key: string) => key;
const translate = (key: string) => key;

export function AdminPage() {
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
    t("admin.actions.cancel"),
    t("admin.actions.primary"),
    t("admin.actions.secondary"),
    t("analytics.cards.card2.title"),
    t("analytics.charts.engagement"),
    t("analytics.charts.revenue"),
    t("reports.cards.card2.title"),
    t("reports.exports.csv"),
    t("reports.exports.monthlyEmail.body"),
    translate("table.bulk.selectAllLabel"),
    t("auth.login.title"),
    t("auth.login.title"),
    t("auth.login.test"),
    t("auth.login.test2"),
  ];

  const statusLine = true
    ? t("auth.login.title")
    : t("auth.login.submit");

  return { heading, labels, statusLine };
}
