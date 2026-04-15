import { redirect } from "next/navigation";
import { WorkspaceSurface } from "@/components/workspace-surface";
import { getAuthContext } from "@/lib/api/auth";

export default async function ProjectPage({ params }: { params: { projectId: string } }) {
  const auth = await getAuthContext();
  if (!auth) {
    redirect(`/?next=${encodeURIComponent(`/projects/${params.projectId}`)}`);
  }
  return <WorkspaceSurface projectId={params.projectId} />;
}
