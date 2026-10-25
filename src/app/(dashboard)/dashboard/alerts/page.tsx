import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { evaluateTeamAlerts } from "@/lib/alerts-server";
import { AlertsClient } from "./AlertsClient";

export default async function AlertsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) redirect("/onboarding");

  const data = await evaluateTeamAlerts(teamId);

  return <AlertsClient rules={data.rules} evaluations={data.evaluations} />;
}
