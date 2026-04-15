import { redirect } from "next/navigation";
import { AdminSurface } from "@/components/admin-surface";
import { getAuthContext } from "@/lib/api/auth";

export default async function AdminPage() {
  const auth = await getAuthContext();
  if (!auth) {
    redirect("/?next=%2Fadmin");
  }
  return <AdminSurface />;
}
