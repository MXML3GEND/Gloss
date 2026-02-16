const t = (key: string) => key;
const translate = (key: string) => key;

export function ProjectsPage() {
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
    t("projects.cards.card1.description"),
    t("projects.cards.card1.title"),
    t("projects.cards.card2.description"),
    t("filters.actions.cancel"),
    t("filters.actions.primary"),
    t("filters.actions.secondary"),
    t("table.cards.card1.description"),
    t("table.cards.card1.title"),
    t("table.cards.card2.description"),
    t("errors.network.retrying"),
    t("tasks.detail.status"),
    t("tasks.detail.status"),
  ];

  const statusLine = true
    ? t("tasks.detail.status")
    : t("teams.overview.title");

  return { heading, labels, statusLine };
}
