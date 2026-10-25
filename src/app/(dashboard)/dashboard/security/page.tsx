import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import UserModel from "@/models/User";
import { SecurityClient } from "./SecurityClient";

export default async function SecurityPage() {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");
  const userId = (session.user as { id?: string }).id;
  await connectDB();
  const user = userId ? await UserModel.findById(userId).select("twoFactorEnabled").lean() : null;
  return <SecurityClient twoFactorEnabled={!!user?.twoFactorEnabled} />;
}
