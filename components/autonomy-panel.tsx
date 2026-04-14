"use client";

import { motion } from "framer-motion";
import { Activity, AlertTriangle, Clock, RotateCcw, ShieldAlert, Cpu, Zap, Signal } from "lucide-react";
import type { InfrastructureState, RuntimeHealthSnapshot } from "@/lib/api/health";
import { cn } from "@/lib/utils";

interface AutonomyPanelProps {
  status: InfrastructureState;
  snapshot: RuntimeHealthSnapshot;
  reasons: string[];
  className?: string;
}

function infrastructureStatusClass(status: InfrastructureState): string {
  if (status === "healthy") return "status status-ready";
  if (status === "recovering") return "status status-recovering";
  if (status === "degraded") return "status status-timeout";
  return "status status-failed";
}

function authClassLabel(errorClass: RuntimeHealthSnapshot["autonomyMode"]["bridgeAuth"]["lastErrorClass"]): string {
  switch (errorClass) {
    case "invalid":
      return "invalid token";
    case "revoked":
      return "revoked token";
    case "expired":
      return "expired token";
    case "token-node-mismatch":
      return "token-node mismatch";
    case "missing-node":
      return "token node missing";
    default:
      return "none";
  }
}

function authRecoveryAction(errorClass: RuntimeHealthSnapshot["autonomyMode"]["bridgeAuth"]["lastErrorClass"]): string {
  switch (errorClass) {
    case "invalid":
      return "Regenerate connection token and update connector env before retry.";
    case "revoked":
      return "Rotate token in UI and restart connector with fresh token.";
    case "expired":
      return "Refresh token and rerun poll after connector restart.";
    case "token-node-mismatch":
      return "Align NODE_ID with token-bound node and retry poll.";
    case "missing-node":
      return "Re-register bridge node, then issue a new token.";
    default:
      return "No bridge auth recovery action required.";
  }
}

export function AutonomyPanel({ status, snapshot, reasons, className }: AutonomyPanelProps) {
  const autonomyInactive = !snapshot.autonomyMode.selfHealingActive;
  const watchdogIntervalLabel =
    snapshot.autonomyMode.pollIntervalSeconds !== null
      ? `${snapshot.autonomyMode.pollIntervalSeconds}s interval`
      : "n/a";

  return (
    <motion.article
      className={cn("panel autonomy-panel", className)}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="row space-between section-title-row">
        <div className="row gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="section-title">Autonomy Mode</h3>
        </div>
        <span className={infrastructureStatusClass(status)}>
          {status}
        </span>
      </div>

      <div className="autonomy-grid">
        <article className="autonomy-item">
          <span className="kpi row gap-1"><ShieldAlert className="h-3 w-3" /> Self-healing</span>
          <strong>{autonomyInactive ? "Inactive" : "Active"}</strong>
        </article>
        <article className="autonomy-item">
          <span className="kpi row gap-1"><Clock className="h-3 w-3" /> Last restart</span>
          <strong>
            {snapshot.autonomyMode.lastRestartAt
              ? new Date(snapshot.autonomyMode.lastRestartAt).toLocaleTimeString()
              : "n/a"}
          </strong>
        </article>
        <article className="autonomy-item">
          <span className="kpi row gap-1"><RotateCcw className="h-3 w-3" /> Attempts</span>
          <strong>{snapshot.attemptCount ?? 0}</strong>
        </article>
        <article className="autonomy-item">
          <span className="kpi row gap-1"><AlertTriangle className="h-3 w-3" /> Next retry</span>
          <strong>{snapshot.nextRetryIn !== null ? `${snapshot.nextRetryIn}s` : "n/a"}</strong>
        </article>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="autonomy-sub-item">
          <span className="kpi row gap-1 text-[10px] uppercase tracking-wider"><Cpu className="h-2.5 w-2.5" /> Watchdog</span>
          <p className="text-xs font-mono">{watchdogIntervalLabel}</p>
        </div>
        <div className="autonomy-sub-item">
          <span className="kpi row gap-1 text-[10px] uppercase tracking-wider"><Zap className="h-2.5 w-2.5" /> Last Token</span>
          <p className="text-xs font-mono">
            {snapshot.autonomyMode.lastTokenRefreshAt 
              ? new Date(snapshot.autonomyMode.lastTokenRefreshAt).toLocaleTimeString() 
              : "never"}
          </p>
        </div>
        <div className="autonomy-sub-item">
          <span className="kpi row gap-1 text-[10px] uppercase tracking-wider"><Signal className="h-2.5 w-2.5" /> Latest Signal</span>
          <p className="text-xs font-mono truncate">
            {snapshot.autonomyMode.latestSignalCode ?? "none"}
          </p>
        </div>
        <div className="autonomy-sub-item">
          <span className="kpi row gap-1 text-[10px] uppercase tracking-wider"><ShieldAlert className="h-2.5 w-2.5" /> Bridge Auth</span>
          <p className="text-xs font-mono truncate">{authClassLabel(snapshot.autonomyMode.bridgeAuth.lastErrorClass)}</p>
        </div>
        <div className="autonomy-sub-item">
          <span className="kpi row gap-1 text-[10px] uppercase tracking-wider"><Clock className="h-2.5 w-2.5" /> Signal At</span>
          <p className="text-xs font-mono">
            {snapshot.autonomyMode.latestSignalAt 
              ? new Date(snapshot.autonomyMode.latestSignalAt).toLocaleTimeString() 
              : "n/a"}
          </p>
        </div>
      </div>

      {snapshot.autonomyMode.bridgeAuth.lastErrorClass ? (
        <div className="error-inline mt-2 row gap-1 bg-bad/10 p-2 rounded-lg border border-bad/20">
          <AlertTriangle className="h-3 w-3" />
          <span className="text-xs">
            Bridge auth: <code>{authClassLabel(snapshot.autonomyMode.bridgeAuth.lastErrorClass)}</code>
            {snapshot.autonomyMode.bridgeAuth.lastErrorAt
              ? ` at ${new Date(snapshot.autonomyMode.bridgeAuth.lastErrorAt).toLocaleTimeString()}`
              : ""}
          </span>
        </div>
      ) : null}

      <p className="kpi mt-1 text-[10px]">{authRecoveryAction(snapshot.autonomyMode.bridgeAuth.lastErrorClass)}</p>

      {snapshot.autonomyMode.bridgeAuth.history.length > 0 ? (
        <div className="mt-2 space-y-1">
          {snapshot.autonomyMode.bridgeAuth.history.slice(0, 4).map((entry, index) => (
            <p key={`${entry.at}-${index}`} className="kpi text-[10px] bg-white/5 px-2 py-1 rounded border border-white/10">
              {new Date(entry.at).toLocaleTimeString()} | {authClassLabel(entry.errorClass)} | {entry.reason}
            </p>
          ))}
        </div>
      ) : null}

      {snapshot.lastErrorCode && (
        <div className="error-inline mt-2 row gap-1 bg-bad/10 p-2 rounded-lg border border-bad/20">
          <AlertTriangle className="h-3 w-3" />
          <span className="text-xs">Last Error: <code>{snapshot.lastErrorCode}</code></span>
        </div>
      )}

      {snapshot.lastRecoveryAt && (
        <p className="kpi mt-1 text-[10px]">
          Last recovery: {new Date(snapshot.lastRecoveryAt).toLocaleString()}
        </p>
      )}

      {reasons.length > 0 && (
        <div className="mt-2 space-y-1">
          {reasons.map((reason, i) => (
            <p key={i} className="error-inline text-[10px] leading-tight bg-bad/5 px-2 py-1 rounded border border-bad/10 italic">
              {reason}
            </p>
          ))}
        </div>
      )}
      
      <div className="mt-4 pt-4 border-t border-white/5">
        <p className="text-[10px] text-muted-foreground leading-relaxed italic">
          {autonomyInactive 
            ? "Zero manual intervention is currently disabled. Manual terminal recovery may be required."
            : "System is in autonomous mode. Failures are handled automatically via browser-monitored watchdogs."}
        </p>
      </div>
    </motion.article>
  );
}
