const t = (key: string) => key;
const translate = (key: string) => key;

export function ProjectList() {
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
    t("projects.detail.members"),
    t("projects.detail.timeline"),
    t("projects.filters.search.placeholder"),
    t("table.filters.search.placeholder"),
    t("table.filters.sortBy.label"),
    t("table.page.subtitle"),
    t("filters.cards.card2.title"),
    t("filters.filters.search.placeholder"),
    t("filters.filters.sortBy.label"),
    t("marketing.pricing.enterpriseBanner"),
    t("dashboard.header.welcome"),
    t("dashboard.header.welcome"),
  ];

  const statusLine = true
    ? t("dashboard.header.welcome")
    : t("notifications.center.title");

  return { heading, labels, statusLine };
}
