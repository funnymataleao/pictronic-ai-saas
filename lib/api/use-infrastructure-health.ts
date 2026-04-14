"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { 
  computeInfrastructureRecovery, 
  extractRuntimeHealthSnapshot, 
  getRuntimeHealthProbe, 
  InfrastructureState, 
  RuntimeHealthProbe, 
  RuntimeHealthSnapshot 
} from "./health";
import type { RuntimeReadinessPayload } from "./contracts";

export function useInfrastructureHealth() {
  const [runtimeReadiness, setRuntimeReadiness] = useState<RuntimeReadinessPayload | null>(null);
  const [runtimeHealthProbe, setRuntimeHealthProbe] = useState<RuntimeHealthProbe>({
    ok: true,
    statusCode: null,
    reason: null,
    payload: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = async () => {
    setLoading(true);
    try {
      const [readinessPayload, healthProbe] = await Promise.all([
        api.getRuntimeReadiness().catch(() => null),
        getRuntimeHealthProbe()
      ]);
      if (readinessPayload) {
        setRuntimeReadiness(readinessPayload);
      }
      setRuntimeHealthProbe(healthProbe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected health probe error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHealth();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadHealth();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const snapshot = useMemo(
    () => extractRuntimeHealthSnapshot(runtimeHealthProbe),
    [runtimeHealthProbe]
  );

  const recovery = useMemo(
    () => computeInfrastructureRecovery(runtimeReadiness, runtimeHealthProbe, snapshot),
    [runtimeReadiness, runtimeHealthProbe, snapshot]
  );

  const autonomyInactive = !snapshot.autonomyMode.selfHealingActive;
  const recoveryFailed = recovery.status === "failed";
  const recoveryActive = recovery.status === "recovering";
  const criticalActionsBlocked = recoveryFailed || recoveryActive || autonomyInactive;

  return {
    readiness: runtimeReadiness,
    probe: runtimeHealthProbe,
    snapshot,
    recovery,
    loading,
    error,
    criticalActionsBlocked,
    autonomyInactive,
    recoveryFailed,
    recoveryActive,
    refresh: loadHealth
  };
}
