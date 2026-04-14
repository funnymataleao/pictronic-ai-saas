"use client";

import Link from "next/link";
import { AutonomyPanel } from "@/components/autonomy-panel";
import { SurfaceShell } from "@/components/surfaces/surface-shell";
import { useInfrastructureHealth } from "@/lib/api/use-infrastructure-health";

export function AdminSurface() {
  const { readiness, probe, snapshot, recovery, error, refresh } = useInfrastructureHealth();

  return (
    <SurfaceShell
      title="Admin Console"
      description="Operational diagnostics for runtime recovery and autonomy telemetry."
      actions={
        <div className="row gap-2">
          <Link className="btn btn-quiet" href="/">
            Back to Projects
          </Link>
          <a className="btn btn-quiet" href="/api/auth/logout">
            Logout
          </a>
        </div>
      }
    >
      {error ? <div className="error-box">Health probe error: {error}</div> : null}

      <div className="dashboard-layout mt-4">
        <div className="flex flex-col gap-4">
          <AutonomyPanel status={recovery.status} snapshot={snapshot} reasons={recovery.reasons} />

          <section className="panel section">
            <div className="row space-between section-title-row">
              <h2 className="section-title">Runtime Diagnostics</h2>
              <button className="btn btn-quiet" onClick={() => void refresh()} type="button">
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <article className="autonomy-sub-item">
                <span className="kpi text-[10px] uppercase tracking-wider">Recovery State</span>
                <p className="text-xs font-mono">{recovery.status}</p>
              </article>
              <article className="autonomy-sub-item">
                <span className="kpi text-[10px] uppercase tracking-wider">Readiness</span>
                <p className="text-xs font-mono">{readiness?.overallStatus ?? "unknown"}</p>
              </article>
              <article className="autonomy-sub-item">
                <span className="kpi text-[10px] uppercase tracking-wider">Health API</span>
                <p className="text-xs font-mono">{probe.statusCode ?? "n/a"}</p>
              </article>
              <article className="autonomy-sub-item">
                <span className="kpi text-[10px] uppercase tracking-wider">Last Error Code</span>
                <p className="text-xs font-mono">{snapshot.lastErrorCode ?? "none"}</p>
              </article>
            </div>

            {recovery.reasons.length > 0 ? (
              <div className="mt-3">
                <p className="kpi text-[10px] uppercase tracking-wider">Current Reasons</p>
                <ul className="mt-2 space-y-1">
                  {recovery.reasons.map((reason) => (
                    <li key={reason} className="text-xs font-mono">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </SurfaceShell>
  );
}
