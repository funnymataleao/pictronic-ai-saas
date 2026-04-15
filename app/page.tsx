import { ProjectsSurface } from "@/components/projects-surface";
import { PublicLanding } from "@/components/public-landing";
import { getAuthContext } from "@/lib/api/auth";

export default async function HomePage() {
  const auth = await getAuthContext();
  const isAuthenticated = auth !== null;
  
  if (!isAuthenticated) {
    return <PublicLanding />;
  }

  return <ProjectsSurface />;
}
