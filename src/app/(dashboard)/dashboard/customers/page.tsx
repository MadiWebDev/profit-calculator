import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getRfm } from "@/lib/rfm-server";
import { CustomersClient } from "./CustomersClient";

export default async function CustomersPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const teamId = (session.user as { teamId?: string }).teamId;
  if (!teamId) redirect("/onboarding");

  const data = await getRfm(teamId, {});

  return (
    <CustomersClient
      customers={data.customers.map((c) => ({
        ...c,
        firstOrderDate: c.firstOrderDate.toISOString(),
        lastOrderDate: c.lastOrderDate.toISOString(),
      }))}
      segments={data.segments}
    />
  );
}
