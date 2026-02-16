const t = (key: string) => key;
const translate = (key: string) => key;

export function TasksPage() {
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
    translate("tasks.actions.secondary"),
    translate("tasks.cards.card1.description"),
    translate("tasks.cards.card1.title"),
    translate("projects.cards.card2.title"),
    translate("projects.create.button"),
    translate("projects.create.success"),
    translate("validation.cards.card2.title"),
    translate("validation.email"),
    translate("validation.filters.search.placeholder"),
    translate("modals.archiveProject.confirmText"),
    t("teams.overview.title"),
    t("teams.overview.title"),
  ];

  const statusLine = true
    ? t("teams.overview.title")
    : t("billing.invoice.download");

  return { heading, labels, statusLine };
}
