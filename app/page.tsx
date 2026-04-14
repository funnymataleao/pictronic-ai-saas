import { cookies } from "next/headers";
import { ProjectsSurface } from "@/components/projects-surface";
import { PublicLanding } from "@/components/public-landing";

export default function HomePage() {
  const isAuthenticated = cookies().get("pictronic_session")?.value === "1";
  
  // Убираем костыли с demoAuth и demoInfraState, которые ломали SSR
  if (!isAuthenticated) {
    return <PublicLanding />;
  }

  // Просто рендерим компонент без передачи кривых серверных объектов
  return <ProjectsSurface />;
}
