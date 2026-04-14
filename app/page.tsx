import { cookies } from "next/headers";
import { ProjectsSurface } from "@/components/projects-surface";
import { PublicLanding } from "@/components/public-landing";

export default async function HomePage() {
  // В Next.js 15 cookies() нужно "await-ить"
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get("pictronic_session")?.value === "1";
  
  // Если не авторизован — показываем посадочную страницу
  if (!isAuthenticated) {
    return <PublicLanding />;
  }

  // Иначе показываем админку, без прокидывания кривых параметров
  return <ProjectsSurface />;
}
