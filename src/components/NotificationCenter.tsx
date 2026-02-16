const t = (key: string) => key;
const translate = (key: string) => key;

export function NotificationCenter() {
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
    translate("notifications.center.title"),
    translate("notifications.filters.search.placeholder"),
    translate("notifications.filters.sortBy.label"),
    translate("filters.cards.card1.description"),
    translate("filters.cards.card1.title"),
    translate("filters.cards.card2.description"),
    translate("table.cards.card2.title"),
    translate("table.empty.description"),
    translate("table.empty.title"),
    translate("validation.slugFormat"),
    t("dashboard.stats.totalUsers"),
    t("dashboard.stats.totalUsers"),
  ];

  const statusLine = true
    ? t("dashboard.stats.totalUsers")
    : t("dashboard.header.welcome");

  return { heading, labels, statusLine };
}
