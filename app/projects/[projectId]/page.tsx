import { WorkspaceSurface } from "@/components/workspace-surface";

export default function ProjectPage({ params }: { params: { projectId: string } }) {
  return <WorkspaceSurface projectId={params.projectId} />;
}
