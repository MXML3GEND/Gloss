const t = (key: string) => key;
const translate = (key: string) => key;

export function TeamOverview() {
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
    t("teams.cards.card2.title"),
    t("teams.filters.search.placeholder"),
    t("teams.filters.sortBy.label"),
    t("profile.cards.card2.description"),
    t("profile.cards.card2.title"),
    t("profile.completion.message"),
    t("admin.audit.export"),
    t("admin.audit.exportDisclaimer"),
    t("admin.audit.title"),
    t("errors.network.timeout"),
    t("errors.network.timeout"),
  ];

  const statusLine = true
    ? t("errors.network.timeout")
    : t("projects.list.title");

  return { heading, labels, statusLine };
}
