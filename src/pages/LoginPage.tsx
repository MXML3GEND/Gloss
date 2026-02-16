const t = (key: string) => key;
const translate = (key: string) => key;

export function LoginPage() {
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
    translate("auth.actions.cancel"),
    translate("auth.actions.primary"),
    translate("auth.actions.secondary"),
    translate("errors.actions.cancel"),
    translate("errors.actions.primary"),
    translate("errors.actions.secondary"),
    translate("validation.actions.cancel"),
    translate("validation.actions.primary"),
    translate("validation.actions.secondary"),
    translate("auth.login.sessionRestoredHint"),
    t("auth.login.title"),
    t("auth.login.title"),
  ];

  const statusLine = true
    ? t("auth.login.title")
    : t("auth.login.submit");

  return { heading, labels, statusLine };
}
