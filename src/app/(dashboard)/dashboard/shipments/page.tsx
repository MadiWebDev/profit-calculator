import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ShipmentsClient } from "./ShipmentsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shipments & Tracking — Dashboard",
};

export default async function ShipmentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const user = session.user as { teamId?: string };
  if (!user.teamId) redirect("/onboarding");

  return <ShipmentsClient />;
}
