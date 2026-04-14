import { cookies } from "next/headers";
import { ProjectsSurface } from "@/components/projects-surface";
import { PublicLanding } from "@/components/public-landing";

type HomePageProps = {
  searchParams?: {
    demoAuth?: string;
    demoInfraState?: string;
  };
};

export default function HomePage({ searchParams }: HomePageProps) {
  const isAuthenticated = cookies().get("pictronic_session")?.value === "1";
  const demoAuthBypass = process.env.NODE_ENV !== "production" && searchParams?.demoAuth === "1";

  if (!isAuthenticated && !demoAuthBypass) {
    return <PublicLanding />;
  }

  const previewInfraState =
    process.env.NODE_ENV !== "production" &&
    (searchParams?.demoInfraState === "healthy" ||
      searchParams?.demoInfraState === "recovering" ||
      searchParams?.demoInfraState === "failed")
      ? searchParams.demoInfraState
      : null;

  return <ProjectsSurface previewInfraState={previewInfraState} />;
}
