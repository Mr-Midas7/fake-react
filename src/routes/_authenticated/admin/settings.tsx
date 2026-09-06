import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/admin/settings-page";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsPage,
});
