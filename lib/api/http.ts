import { NextRequest, NextResponse } from "next/server";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      data,
    },
    { status }
  );
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error",
        details: null,
      },
    },
    { status: 500 }
  );
}

export async function parseJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "INVALID_BODY", "JSON body must be an object");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(400, "INVALID_JSON", "Invalid JSON payload");
  }
}

export function requireString(
  value: unknown,
  field: string,
  opts?: { min?: number; max?: number; allowEmpty?: boolean }
): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' must be a string`);
  }

  const trimmed = value.trim();
  const min = opts?.min ?? 1;
  const max = opts?.max ?? 1000;
  const allowEmpty = opts?.allowEmpty ?? false;

  if (!allowEmpty && trimmed.length < min) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' must have at least ${min} chars`);
  }

  if (trimmed.length > max) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' must have at most ${max} chars`);
  }

  return trimmed;
}

export function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' must be an array`);
  }
  return value;
}

export function asOptionalString(value: unknown, field: string, max = 255): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireString(value, field, { min: 1, max });
}

export function requireUUID(value: string, field: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field '${field}' must be a UUID`);
  }
  return value;
}

export function requireIdempotencyKey(request: NextRequest): string {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key) {
    throw new ApiError(
      400,
      "MISSING_IDEMPOTENCY_KEY",
      "Idempotency-Key header is required for this endpoint"
    );
  }
  if (key.length > 128) {
    throw new ApiError(400, "VALIDATION_ERROR", "Idempotency-Key must be <= 128 chars");
  }
  return key;
}

export function getSearchParam(request: NextRequest, key: string): string | undefined {
  const value = request.nextUrl.searchParams.get(key);
  return value === null || value === "" ? undefined : value;
}
