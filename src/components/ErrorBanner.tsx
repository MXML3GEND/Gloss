const t = (key: string) => key;
const translate = (key: string) => key;

export function ErrorBanner() {
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
    t("errors.forms.invalidEmail"),
    t("errors.forms.required"),
    t("errors.network.offline"),
    t("validation.filters.sortBy.label"),
    t("validation.maxLength"),
    t("validation.minLength"),
    t("notifications.inbox.unread"),
    t("notifications.page.subtitle"),
    t("notifications.page.title"),
    t("tasks.detail.status"),
    t("tasks.detail.status"),
  ];

  const statusLine = true
    ? t("tasks.detail.status")
    : t("teams.overview.title");

  return { heading, labels, statusLine };
}
