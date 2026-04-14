import { ApiError } from "@/lib/api/http";

interface EnvRequirement {
  key: string;
  candidates: string[];
  scope: "public" | "server";
  required: true;
}

interface ResolvedEnvRequirement {
  key: string;
  value: string;
  source: string;
  scope: "public" | "server";
}

const RUNTIME_ENV_REQUIREMENTS: EnvRequirement[] = [
  {
    key: "supabaseUrl",
    candidates: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"],
    scope: "public",
    required: true,
  },
  {
    key: "supabaseAnonKey",
    candidates: ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"],
    scope: "public",
    required: true,
  },
  {
    key: "supabaseServiceRoleKey",
    candidates: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"],
    scope: "server",
    required: true,
  },
];

function resolveFromCandidates(candidates: string[]): { value: string; source: string } | null {
  for (const candidate of candidates) {
    const value = process.env[candidate]?.trim();
    if (value) {
      return { value, source: candidate };
    }
  }
  return null;
}

export function resolveRuntimeEnvContract(): {
  resolved: ResolvedEnvRequirement[];
  missing: EnvRequirement[];
} {
  const resolved: ResolvedEnvRequirement[] = [];
  const missing: EnvRequirement[] = [];

  for (const requirement of RUNTIME_ENV_REQUIREMENTS) {
    const result = resolveFromCandidates(requirement.candidates);
    if (!result) {
      missing.push(requirement);
      continue;
    }

    resolved.push({
      key: requirement.key,
      value: result.value,
      source: result.source,
      scope: requirement.scope,
    });
  }

  return { resolved, missing };
}

export function assertRuntimeEnvContract(context: string): {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  sources: Record<string, string>;
} {
  const { resolved, missing } = resolveRuntimeEnvContract();

  if (missing.length > 0) {
    throw new ApiError(
      503,
      "ENV_CONTRACT_MISSING",
      `Runtime env contract is invalid for ${context}. Set missing variables and restart runtime.`,
      {
        expectedSources: ".env or secrets manager",
        missing: missing.map((item) => ({
          key: item.key,
          candidates: item.candidates,
          scope: item.scope,
        })),
      }
    );
  }

  const map = Object.fromEntries(resolved.map((item) => [item.key, item.value]));
  const sources = Object.fromEntries(resolved.map((item) => [item.key, item.source]));

  return {
    supabaseUrl: map.supabaseUrl,
    supabaseAnonKey: map.supabaseAnonKey,
    supabaseServiceRoleKey: map.supabaseServiceRoleKey,
    sources,
  };
}
