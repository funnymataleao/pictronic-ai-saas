import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api/http";

const DEFAULT_BOOTSTRAP_KEY = "bridge-bootstrap-dev";
const DEFAULT_ADMIN_KEY = "bridge-admin-dev";

export function requireBridgeBootstrapKey(request: NextRequest): void {
  const actual = request.headers.get("x-bridge-bootstrap-key")?.trim();
  const expected = process.env.BRIDGE_BOOTSTRAP_KEY ?? DEFAULT_BOOTSTRAP_KEY;

  if (!actual || actual !== expected) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid x-bridge-bootstrap-key");
  }
}

export function requireBridgeAdminKey(request: NextRequest): void {
  const actual = request.headers.get("x-bridge-admin-key")?.trim();
  const expected = process.env.BRIDGE_ADMIN_KEY ?? DEFAULT_ADMIN_KEY;

  if (!actual || actual !== expected) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid x-bridge-admin-key");
  }
}

export function requireBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (match && match[1]) {
      return match[1].trim().replace(/^"(.*)"$/, "$1");
    }
  }

  const fallbackToken = request.headers.get("x-bridge-connection-token")?.trim();
  if (fallbackToken) {
    return fallbackToken.replace(/^"(.*)"$/, "$1");
  }

  if (!authorization) {
    throw new ApiError(
      401,
      "UNAUTHORIZED",
      "Missing Authorization header (or x-bridge-connection-token fallback)"
    );
  }

  throw new ApiError(
    401,
    "UNAUTHORIZED",
    "Authorization must be Bearer token (or use x-bridge-connection-token)"
  );
}
