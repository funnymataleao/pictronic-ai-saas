import { cookies } from "next/headers";
import { ProjectsSurface } from "@/components/projects-surface";
import { PublicLanding } from "@/components/public-landing";

export default function HomePage() {
  // Стандартная синхронная проверка куки (работает везде)
  const cookieStore = cookies();
  const isAuthenticated = cookieStore.get("pictronic_session")?.value === "1";
  
  if (!isAuthenticated) {
    return <PublicLanding />;
  }

  // Рендерим админку без передачи сломанных пропсов
  return <ProjectsSurface />;
}
