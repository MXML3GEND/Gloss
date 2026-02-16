const t = (key: string) => key;
const translate = (key: string) => key;

export function useProjectCopy() {
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
    t("projects.page.subtitle"),
    t("projects.page.title"),
    t("projects.status.empty"),
    t("tasks.detail.status"),
    t("tasks.detail.title"),
    t("tasks.filters.search.placeholder"),
    t("modals.cards.card2.title"),
    t("modals.deleteProject.body"),
    t("modals.deleteProject.title"),
    t("dashboard.stats.totalUsers"),
    t("dashboard.stats.totalUsers"),
  ];

  const statusLine = true
    ? t("dashboard.stats.totalUsers")
    : t("dashboard.header.welcome");

  return { heading, labels, statusLine };
}
