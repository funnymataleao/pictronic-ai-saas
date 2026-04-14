import { ApiError } from "@/lib/api/http";

interface ReplayResponse<T> {
  body: T;
  status: number;
}

interface StoredResponse<T> extends ReplayResponse<T> {
  fingerprint: string;
}

const responses = new Map<string, StoredResponse<unknown>>();

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`;
}

export async function withIdempotentReplay<T>(
  scope: string,
  idempotencyKey: string,
  fingerprintPayload: unknown,
  execute: () => Promise<ReplayResponse<T>> | ReplayResponse<T>
): Promise<{ replayed: boolean; body: T; status: number }> {
  const mapKey = `${scope}:${idempotencyKey}`;
  const fingerprint = stableSerialize(fingerprintPayload);
  const existing = responses.get(mapKey) as StoredResponse<T> | undefined;

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw new ApiError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "Idempotency-Key was already used with a different request payload"
      );
    }

    return {
      replayed: true,
      body: existing.body,
      status: existing.status,
    };
  }

  const result = await execute();
  responses.set(mapKey, {
    fingerprint,
    body: result.body,
    status: result.status,
  });

  return {
    replayed: false,
    body: result.body,
    status: result.status,
  };
}
