const t = (key: string) => key;
const translate = (key: string) => key;

export function OnboardingPage() {
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
    t("onboarding.actions.cancel"),
    t("onboarding.actions.primary"),
    t("onboarding.actions.secondary"),
    t("projects.actions.cancel"),
    t("projects.actions.primary"),
    t("projects.actions.secondary"),
    t("tasks.actions.cancel"),
    t("tasks.actions.complete"),
    t("tasks.actions.primary"),
    t("billing.invoice.vatExplanation"),
    t("errors.network.timeout"),
    t("errors.network.timeout"),
  ];

  const statusLine = true
    ? t("errors.network.timeout")
    : t("projects.list.title");

  return { heading, labels, statusLine };
}
