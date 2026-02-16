const t = (key: string) => key;
const translate = (key: string) => key;

export function useAuthMessages() {
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
    translate("auth.cards.card1.description"),
    translate("auth.cards.card1.title"),
    translate("auth.cards.card2.description"),
    translate("validation.password.strength"),
    translate("validation.required"),
    translate("validation.status.empty"),
    translate("errors.network.timeout"),
    translate("errors.page.subtitle"),
    translate("errors.page.title"),
    t("auth.login.title"),
    t("auth.login.title"),
  ];

  const statusLine = true
    ? t("auth.login.title")
    : t("auth.login.submit");

  return { heading, labels, statusLine };
}
