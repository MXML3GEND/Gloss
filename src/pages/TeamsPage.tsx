const t = (key: string) => key;
const translate = (key: string) => key;

export function TeamsPage() {
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
    t("teams.cards.card1.description"),
    t("teams.cards.card1.title"),
    t("teams.cards.card2.description"),
    t("profile.actions.secondary"),
    t("profile.cards.card1.description"),
    t("profile.cards.card1.title"),
    t("notifications.cards.card2.description"),
    t("notifications.cards.card2.title"),
    t("notifications.center.empty"),
    t("forms.feedback.satisfactionLabel"),
    t("billing.invoice.download"),
    t("billing.invoice.download"),
  ];

  const statusLine = true
    ? t("billing.invoice.download")
    : t("auth.login.title");

  return { heading, labels, statusLine };
}
