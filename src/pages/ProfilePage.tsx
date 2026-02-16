const t = (key: string) => key;
const translate = (key: string) => key;

export function ProfilePage() {
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
    translate("profile.actions.cancel"),
    translate("profile.actions.edit"),
    translate("profile.actions.primary"),
    translate("teams.actions.cancel"),
    translate("teams.actions.primary"),
    translate("teams.actions.secondary"),
    translate("notifications.banner.saved"),
    translate("notifications.cards.card1.description"),
    translate("notifications.cards.card1.title"),
    translate("notifications.preferences.soundLabel"),
    t("notifications.center.title"),
    t("notifications.center.title"),
  ];

  const statusLine = true
    ? t("notifications.center.title")
    : t("errors.network.timeout");

  return { heading, labels, statusLine };
}
