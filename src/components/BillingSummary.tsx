const t = (key: string) => key;
const translate = (key: string) => key;

export function BillingSummary() {
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
    translate("billing.cards.card1.description"),
    translate("billing.cards.card1.title"),
    translate("billing.cards.card2.description"),
    translate("reports.library.empty"),
    translate("reports.library.title"),
    translate("reports.page.subtitle"),
    translate("errors.cards.card2.title"),
    translate("errors.filters.search.placeholder"),
    translate("errors.filters.sortBy.label"),
    t("projects.list.title"),
    t("projects.list.title"),
  ];

  const statusLine = true
    ? t("projects.list.title")
    : t("tasks.detail.status");

  return { heading, labels, statusLine };
}
