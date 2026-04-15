import { apiError, jsonOk } from "@/lib/api/http";
import { requireAuth } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    return jsonOk({
      authenticated: true,
      user: {
        id: auth.userId,
        email: auth.email,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
