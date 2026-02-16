const t = (key: string) => key;
const translate = (key: string) => key;

export function useValidationMessages() {
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
    translate("validation.status.loading"),
    translate("validation.status.success"),
    translate("validation.table.columns.name"),
    translate("forms.cards.card2.title"),
    translate("forms.common.cancel"),
    translate("forms.common.reset"),
    translate("errors.permissions.denied"),
    translate("errors.server.unavailable"),
    translate("errors.status.empty"),
    t("notifications.center.title"),
    t("notifications.center.title"),
  ];

  const statusLine = true
    ? t("notifications.center.title")
    : t("errors.network.timeout");

  return { heading, labels, statusLine };
}
