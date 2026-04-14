"use client";

import Link from "next/link";
import Masonry from "react-masonry-css";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle, Clock, Eye, MoreHorizontal, Settings, ShieldAlert, Sparkles } from "lucide-react";
import { SurfaceShell } from "@/components/surfaces/surface-shell";
import { AutonomyPanel } from "@/components/autonomy-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { ApiError, api } from "@/lib/api/client";
import { useInfrastructureHealth } from "@/lib/api/use-infrastructure-health";
import { getRuntimeHealthProbe } from "@/lib/api/health";
import type {
  Asset,
  AssetStatus,
  GenerateRequest,
  IdempotencyActivity,
  LocalNode,
  MetadataStatus,
  UploadItem
} from "@/lib/api/contracts";

type WorkspaceSurfaceProps = {
  projectId: string;
};

type BatchPreset = 10 | 20 | "custom";
type AspectPreset = "1:1" | "4:5" | "3:2" | "16:9";
const OPS_ROUTE_PATH = "/api/runtime/readiness";
const HEALTH_ROUTE_PATH = "/api/health";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = typeof error.details === "string" && error.details.length > 0 ? ` (${error.details})` : "";
    return `${error.code}: ${error.message}${details}`;
  }
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

function statusClass(status: AssetStatus | "timeout"): string {
  return `status status-${status}`;
}

function metadataStatusClass(status: MetadataStatus): string {
  if (status === "ok") return "status status-ready";
  if (status === "pending") return "status status-processing";
  if (status === "timeout") return "status status-timeout";
  return "status status-failed";
}

function infrastructureStatusClass(status: string): string {
  if (status === "healthy") return "status status-ready";
  if (status === "recovering") return "status status-recovering";
  if (status === "degraded") return "status status-timeout";
  return "status status-failed";
}

function getContractMismatch(error?: string): string | null {
  if (!error) return null;
  const marker = "Contract mismatch fallback:";
  const index = error.indexOf(marker);
  if (index === -1) return null;
  return error.slice(index);
}

function operatorGuidance(
  status: string,
  criticalActionsBlocked: boolean,
  autonomyInactive: boolean,
  recoveryFailed: boolean,
  recoveryActive: boolean
): string {
  if (recoveryFailed) {
    return "Recovery failed. Open Settings & Ops to inspect diagnostics and restart bridge recovery actions.";
  }
  if (recoveryActive) {
    return "Recovery is currently running. Critical actions are temporarily paused until stability is restored.";
  }
  if (autonomyInactive) {
    return "Autonomy Mode is inactive. Enable watchdog automation before running generation and upload actions.";
  }
  if (criticalActionsBlocked) {
    return "Critical actions are blocked by runtime guardrails. Open Settings & Ops for details.";
  }
  if (status === "degraded") {
    return "System is degraded but operational. Monitor readiness in Settings & Ops while continuing non-critical work.";
  }
  return "System is healthy. You can proceed with generation, approvals, and uploads.";
}

function assetHeight(asset: Asset): number {
  const base = 160;
  if (asset.aspect === "1:1") return base;
  if (asset.aspect === "4:5") return base * 1.25;
  if (asset.aspect === "3:2") return base * 0.67;
  if (asset.aspect === "16:9") return base * 0.56;
  return base;
}

export function WorkspaceSurface({ projectId }: WorkspaceSurfaceProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsCursor, setAssetsCursor] = useState<string | null>(null);
  const [hasMoreAssets, setHasMoreAssets] = useState(true);
  const [loadingMoreAssets, setLoadingMoreAssets] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [editorTitle, setEditorTitle] = useState("");
  const [editorTags, setEditorTags] = useState("");

  const [form, setForm] = useState<GenerateRequest>({
    prompt: "",
    model: "flux-dev",
    provider: "local",
    batch: 10
  });
  const [aspect, setAspect] = useState<AspectPreset>("1:1");
  const [batchPreset, setBatchPreset] = useState<BatchPreset>(10);
  const [lastActivity, setLastActivity] = useState<IdempotencyActivity | null>(null);
  const [lastBatchStartedAt, setLastBatchStartedAt] = useState<string | null>(null);
  const [uploadGuardMessage, setUploadGuardMessage] = useState<string | null>(null);

  const [localNode, setLocalNode] = useState<LocalNode | null>(null);
  const [nodeError, setNodeError] = useState<string | null>(null);
  const [nodeCheckedAt, setNodeCheckedAt] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);

  const {
    readiness: runtimeReadiness,
    error: readinessError,
    snapshot: runtimeHealthSnapshot,
    recovery: infrastructureRecovery,
    criticalActionsBlocked,
    autonomyInactive,
    recoveryFailed: recoveryFailedBlock,
    recoveryActive: recoveryInProgressBlock,
    refresh: refreshHealth
  } = useInfrastructureHealth();

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const feedSentinelRef = useRef<HTMLDivElement | null>(null);

  const activeAsset = useMemo(() => assets.find((a) => a.id === activeAssetId), [assets, activeAssetId]);
  const uploadSummary = useMemo(() => {
    const failed = uploads.filter((u) => u.status === "failed").length;
    const uploaded = uploads.filter((u) => u.status === "uploaded").length;
    return { failed, uploaded };
  }, [uploads]);

  const batchQueue = useMemo(() => {
    return {
      queued: uploads.filter((u) => u.status === "queued").length,
      processing: uploads.filter((u) => u.status === "uploading").length,
      ready: assets.filter((a) => a.status === "approved").length,
      uploading: uploads.filter((u) => u.status === "uploading").length,
      uploaded: uploads.filter((u) => u.status === "uploaded").length,
      failed: uploads.filter((u) => u.status === "failed").length
    };
  }, [uploads, assets]);

  const reliabilityBlocked = useMemo(() => {
    if (!lastBatchStartedAt) return false;
    const start = new Date(lastBatchStartedAt).getTime();
    const now = Date.now();
    return now - start < 30000;
  }, [lastBatchStartedAt]);

  const reliabilityGuardMessage = reliabilityBlocked
    ? "Reliability guard active: please wait 30s between generation batches."
    : null;

  const autonomyGuardMessage = autonomyInactive
    ? "Autonomy Mode is inactive. Critical generation, approval, and upload actions are locked until watchdog automation is active."
    : null;
  const recoveryGuardMessage = recoveryFailedBlock
    ? "Recovery failed: critical actions are disabled until infrastructure recovery completes."
    : recoveryInProgressBlock
      ? "Infrastructure recovery is in progress: critical actions are temporarily locked."
      : null;
  const operatorSummaryText = operatorGuidance(
    infrastructureRecovery.status,
    criticalActionsBlocked,
    autonomyInactive,
    recoveryFailedBlock,
    recoveryInProgressBlock
  );

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [assetPage, nextUploads, nodePayload] = await Promise.all([
        api.listAssetsPage(projectId),
        api.listUploads(projectId),
        api.getLocalNodeStatus().catch(() => null),
        refreshHealth()
      ]);
      setAssets(assetPage.items);
      setAssetsCursor(assetPage.nextCursor);
      setHasMoreAssets(Boolean(assetPage.nextCursor));
      setUploads(nextUploads);
      setSelectedAssetIds((prev) => prev.filter((id) => assetPage.items.some((asset) => asset.id === id)));
      if (nodePayload) {
        setLocalNode(nodePayload.items[0] ?? null);
        setNodeCheckedAt(nodePayload.checkedAt);
        setNodeError(null);
      } else {
        setNodeError("Could not load local node status");
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const loadMoreAssets = useCallback(async () => {
    if (!assetsCursor || loadingMoreAssets || loading) return;
    setLoadingMoreAssets(true);
    setError(null);
    try {
      const page = await api.listAssetsPage(projectId, { cursor: assetsCursor });
      setAssets((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const merged = [...prev];
        for (const item of page.items) {
          if (!seen.has(item.id)) {
            merged.push(item);
            seen.add(item.id);
          }
        }
        return merged;
      });
      setAssetsCursor(page.nextCursor);
      setHasMoreAssets(Boolean(page.nextCursor));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingMoreAssets(false);
    }
  }, [assetsCursor, loadingMoreAssets, loading, projectId]);

  useEffect(() => {
    void loadAll();
  }, [projectId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadAll();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [projectId]);

  useEffect(() => {
    const sentinel = feedSentinelRef.current;
    if (!sentinel || !hasMoreAssets) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreAssets();
        }
      },
      { rootMargin: "280px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreAssets, loadMoreAssets]);

  useEffect(() => {
    if (!activeAsset) return;
    setEditorTitle(activeAsset.title);
    setEditorTags(activeAsset.tags.join(", "));
  }, [activeAssetId, activeAsset]);

  useEffect(() => {
    const area = promptRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 220)}px`;
  }, [form.prompt]);

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    if (criticalActionsBlocked) return;
    setWorking(true);
    setError(null);
    try {
      const activity = await api.generate(projectId, form);
      setLastActivity(activity);
      setLastBatchStartedAt(activity.acceptedAt);
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function onRefreshNodeStatus() {
    setWorking(true);
    setNodeError(null);
    try {
      const payload = await api.getLocalNodeStatus();
      setLocalNode(payload.items[0] ?? null);
      setNodeCheckedAt(payload.checkedAt);
      await refreshHealth();
    } catch (err) {
      setNodeError(getErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function onGenerateConnectionToken() {
    setWorking(true);
    setNodeError(null);
    try {
      const payload = await api.generateLocalNodeToken(localNode?.nodeId);
      setLocalNode(payload.node);
      setGeneratedToken(payload.connectionToken.token);
      setTokenExpiresAt(payload.connectionToken.expiresAt);
      const statusPayload = await api.getLocalNodeStatus();
      setNodeCheckedAt(statusPayload.checkedAt);
      await refreshHealth();
    } catch (err) {
      setNodeError(getErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function onStartReliabilityRun() {
    if (reliabilityBlocked || criticalActionsBlocked) return;
    setWorking(true);
    setError(null);
    try {
      const activity = await api.generate(projectId, form);
      setLastActivity(activity);
      setLastBatchStartedAt(activity.acceptedAt);
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function onApprove(assetId: string) {
    if (criticalActionsBlocked) return;
    setWorking(true);
    setError(null);
    try {
      const activity = await api.approveAsset(assetId, projectId);
      setLastActivity(activity);
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function onRegenerateMetadata(assetId: string) {
    if (criticalActionsBlocked) return;
    setWorking(true);
    setError(null);
    try {
      const activity = await api.regenerateMetadata(assetId);
      setLastActivity(activity);
      await loadAll();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function onStartUpload() {
    if (selectedAssetIds.length === 0) return;
    if (criticalActionsBlocked) return;
    setWorking(true);
    setError(null);
    setUploadGuardMessage(null);
    try {
      const activity = await api.startUpload(selectedAssetIds, projectId);
      setLastActivity(activity);
      await loadAll();
      setSelectedAssetIds([]);
    } catch (err) {
      if (err instanceof ApiError && err.code === "route_unavailable") {
        setUploadGuardMessage(err.message);
      }
      setError(getErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  async function onSaveMetadata() {
    if (!activeAsset || criticalActionsBlocked) return;

    const tags = editorTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    setWorking(true);
    setError(null);
    try {
      await api.updateMetadata(activeAsset.id, {
        title: editorTitle.trim(),
        tags
      });
      await loadAll();
      setActiveAssetId(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  function toggleSelection(assetId: string, checked: boolean) {
    setSelectedAssetIds((prev) =>
      checked ? Array.from(new Set([...prev, assetId])) : prev.filter((id) => id !== assetId)
    );
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLElement>, assetId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setActiveAssetId(assetId);
  }

  function applyBatchPreset(nextPreset: BatchPreset) {
    setBatchPreset(nextPreset);
    if (nextPreset === "custom") return;
    setForm((prev) => ({ ...prev, batch: nextPreset }));
  }

  function selectFailedUploadsForRetry() {
    const failedIds = Array.from(new Set(uploads.filter((upload) => upload.status === "failed").map((upload) => upload.assetId)));
    setSelectedAssetIds(failedIds);
  }

  return (
    <SurfaceShell
      title="Main Dashboard"
      description="Header status, generation console, masonry gallery, and settings in one workspace."
      actions={
        <div className="row">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="h-4 w-4" />
                Settings & Ops
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:min-w-[400px]">
              <SheetHeader className="pr-8">
                <SheetTitle>Runtime & Bridge Settings</SheetTitle>
                <SheetDescription>
                  Control runtime checks, local node token rotation, and reliability run guardrails.
                </SheetDescription>
              </SheetHeader>
              <div className="sheet-stack">
                <section className="panel section">
                  <h3 className="section-title">Readiness</h3>
                  <p className="kpi">{reliabilityGuardMessage}</p>
                  <div className="readiness-grid">
                    {(runtimeReadiness?.dependencies ?? []).map((dependency) => (
                      <article className="readiness-item" key={dependency.key}>
                        <div className="row space-between">
                          <strong>{dependency.label}</strong>
                          <span
                            className={`status ${
                              dependency.status === "online"
                                ? "status-ready"
                                : dependency.status === "degraded"
                                  ? "status-timeout"
                                  : "status-failed"
                            }`}
                          >
                            {dependency.status}
                          </span>
                        </div>
                        <p className="kpi">{dependency.message}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section className="panel section">
                  <h3 className="section-title">Node Bridge</h3>
                  <p className="kpi">
                    {localNode
                      ? `Node ${localNode.nodeId} (${localNode.machineId})`
                      : "No local node connected yet. Generate a token to bootstrap bridge auth."}
                  </p>
                  <p className="kpi">
                    Last seen: {localNode ? new Date(localNode.lastSeenAt).toLocaleTimeString() : "n/a"} | Checked:{" "}
                    {nodeCheckedAt ? new Date(nodeCheckedAt).toLocaleTimeString() : "n/a"}
                  </p>
                  <div className="row">
                    <Button onClick={() => void onGenerateConnectionToken()} disabled={working} size="sm">
                      {working ? "Generating..." : "Generate Token"}
                    </Button>
                    <Button variant="outline" onClick={() => void onRefreshNodeStatus()} disabled={working} size="sm">
                      Refresh Node
                    </Button>
                  </div>
                  {generatedToken ? (
                    <p className="kpi token-line">
                      Connection token: <code>{generatedToken}</code> (expires {tokenExpiresAt ? new Date(tokenExpiresAt).toLocaleString() : "n/a"})
                    </p>
                  ) : null}
                </section>
                <section className="panel section">
                  <h3 className="section-title">Diagnostics</h3>
                  <p className="kpi">Signals: <code>{OPS_ROUTE_PATH}</code> + <code>{HEALTH_ROUTE_PATH}</code></p>
                  <div className="queue-matrix">
                    <span className="status status-empty">attemptCount: {runtimeHealthSnapshot.attemptCount ?? "n/a"}</span>
                    <span className="status status-empty">nextRetryIn: {runtimeHealthSnapshot.nextRetryIn !== null ? `${runtimeHealthSnapshot.nextRetryIn}s` : "n/a"}</span>
                    <span className="status status-empty">lastErrorCode: {runtimeHealthSnapshot.lastErrorCode ?? "n/a"}</span>
                  </div>
                  <details className="mt-3">
                    <summary className="kpi cursor-pointer">Advanced bridge diagnostics</summary>
                    <div className="mt-2">
                      <AutonomyPanel
                        status={infrastructureRecovery.status}
                        snapshot={runtimeHealthSnapshot}
                        reasons={infrastructureRecovery.reasons}
                      />
                    </div>
                  </details>
                </section>
              </div>
            </SheetContent>
          </Sheet>
          <div className="row">
            <span className={infrastructureStatusClass(infrastructureRecovery.status)}>{infrastructureRecovery.status}</span>
            <span className={`status ${localNode?.status === "online" ? "status-ready" : "status-empty"}`}>
              node: {localNode?.status ?? "offline"}
            </span>
          </div>
          <Link className="btn btn-quiet" href="/">
            Back to projects
          </Link>
        </div>
      }
    >
      {error ? <div className="error-box">API error: {error}</div> : null}
      {nodeError ? <div className="error-box">Local Node error: {nodeError}</div> : null}
      {readinessError ? <div className="error-box">Readiness error: {readinessError}</div> : null}
      {autonomyGuardMessage ? <div className="error-box">{autonomyGuardMessage}</div> : null}
      {recoveryGuardMessage ? <div className="error-box">{recoveryGuardMessage}</div> : null}

      <section className="dashboard-layout mt-4">
        <div className="flex flex-col gap-4">
          <section className="panel section">
            <div className="row space-between section-title-row">
              <h3 className="section-title">Recovery Status</h3>
              <span className={infrastructureStatusClass(infrastructureRecovery.status)}>{infrastructureRecovery.status}</span>
            </div>
            <div className="queue-matrix">
              <span className={`status ${autonomyInactive ? "status-failed" : "status-ready"}`}>
                autonomy: {autonomyInactive ? "inactive" : "active"}
              </span>
              <span className={`status ${criticalActionsBlocked ? "status-failed" : "status-ready"}`}>
                critical actions: {criticalActionsBlocked ? "locked" : "available"}
              </span>
              <span className={`status ${localNode?.status === "online" ? "status-ready" : "status-empty"}`}>
                node: {localNode?.status ?? "offline"}
              </span>
            </div>
            <p className="kpi mt-2">{operatorSummaryText}</p>
            <p className="kpi">Use <strong>Settings & Ops</strong> for detailed telemetry and incident diagnostics.</p>
          </section>

          <motion.article
            className={`panel creation-console ${working ? "is-generating" : ""}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, ease: "easeOut", delay: 0.1 }}
          >
            <div className="row space-between section-title-row">
              <h3 className="section-title">Creation Console</h3>
              <span className="status status-empty">aspect {aspect}</span>
            </div>
            <form className="creation-form" onSubmit={onGenerate}>
              <label className="field">
                Prompt
                <textarea
                  ref={promptRef}
                  className="textarea prompt-auto"
                  value={form.prompt}
                  onChange={(event) => setForm((prev) => ({ ...prev, prompt: event.target.value }))}
                  placeholder="Describe your visual concept"
                />
              </label>

              <div className="console-grid">
                <label className="field">
                  Model
                  <Select value={form.model} onValueChange={(value) => setForm((prev) => ({ ...prev, model: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flux-dev">flux-dev</SelectItem>
                      <SelectItem value="sdxl">sdxl</SelectItem>
                      <SelectItem value="flux-pro">flux-pro</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="field">
                  Provider
                  <Select value={form.provider} onValueChange={(value) => setForm((prev) => ({ ...prev, provider: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">local</SelectItem>
                      <SelectItem value="api">api</SelectItem>
                      <SelectItem value="cloud">cloud</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="field">
                  Aspect
                  <Select value={aspect} onValueChange={(value: AspectPreset) => setAspect(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Aspect" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:1">1:1</SelectItem>
                      <SelectItem value="4:5">4:5</SelectItem>
                      <SelectItem value="3:2">3:2</SelectItem>
                      <SelectItem value="16:9">16:9</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <div className="row batch-preset-row">
                <span className="kpi">Batch</span>
                <Button type="button" size="sm" variant={batchPreset === 10 ? "default" : "outline"} onClick={() => applyBatchPreset(10)}>10</Button>
                <Button type="button" size="sm" variant={batchPreset === 20 ? "default" : "outline"} onClick={() => applyBatchPreset(20)}>20</Button>
                <Button type="button" size="sm" variant={batchPreset === "custom" ? "default" : "outline"} onClick={() => applyBatchPreset("custom")}>Custom</Button>
                {batchPreset === "custom" ? (
                  <input
                    className="input custom-batch"
                    type="number"
                    min={1}
                    max={100}
                    value={form.batch}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, batch: Math.max(1, Math.min(100, Number(event.target.value) || 1)) }))
                    }
                  />
                ) : null}
              </div>

              <div className="row">
                <Button className="gap-2" disabled={working || criticalActionsBlocked} type="submit">
                  
                  <Sparkles className="h-4 w-4" />
                  {working ? "Generating..." : "Generate"}
                </Button>
                <Button
                  variant="outline"
                  disabled={working || reliabilityBlocked || criticalActionsBlocked}
                  onClick={() => void onStartReliabilityRun()}
                  type="button"
                >
                  Start reliability run
                </Button>
                <Button variant="outline" disabled={working || loading} onClick={() => void loadAll()} type="button">
                  Refresh
                </Button>
              </div>
              <p className={`kpi ${reliabilityBlocked || autonomyInactive ? "guard-inline" : ""}`}>
                {autonomyGuardMessage ?? reliabilityGuardMessage}
              </p>
            </form>
            {lastActivity ? (
              <div className="idempotency-card">
                <div className="row space-between">
                  <strong>Idempotency</strong>
                  <span className={`status ${lastActivity.duplicate ? "status-timeout" : "status-ready"}`}>
                    {lastActivity.duplicate ? "duplicate" : "new"}
                  </span>
                </div>
                <p className="kpi">{lastActivity.scope} · <code>{lastActivity.key}</code></p>
              </div>
            ) : null}
          </motion.article>
        </div>

        <motion.article
          className="panel gallery-surface"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.08 }}
        >
          <div className="row space-between section-title-row">
            <h3 className="section-title">Masonry Gallery</h3>
            <span className="kpi">{assets.length} assets</span>
          </div>
          {loading ? <p className="kpi">Loading assets...</p> : null}
          {!loading && assets.length === 0 ? (
            <div className="empty-state">
              <Sparkles className="empty-state-icon" />
              <h3 className="section-title">No assets yet</h3>
              <p className="kpi">
                Your creative journey starts here. Describe your concept in the console and hit Generate.
              </p>
            </div>
          ) : null}

          <Masonry breakpointCols={{ default: 3, 1100: 3, 1024: 2, 720: 1 }} className="my-masonry-grid" columnClassName="my-masonry-grid_column">
            {assets.map((asset, index) => {
              const canApprove = asset.status === "ready";
              const canQueue = asset.status === "approved" || asset.status === "failed";
              const checked = selectedAssetIds.includes(asset.id);
              const mismatchMessage = getContractMismatch(asset.error);

              return (
                <motion.article
                  key={asset.id}
                  className="masonry-card"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: "easeOut", delay: index * 0.02 }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open asset ${asset.id}`}
                  onClick={() => setActiveAssetId(asset.id)}
                  onKeyDown={(event) => onCardKeyDown(event, asset.id)}
                >
                  <div className="card-actions-float" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 bg-black/60 hover:bg-black/80 backdrop-blur-sm border-white/10 text-xs"
                      disabled={working || !canApprove || criticalActionsBlocked}
                      onClick={() => void onApprove(asset.id)}
                      aria-label="Approve asset"
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 bg-black/60 hover:bg-black/80 backdrop-blur-sm border-white/10 text-xs"
                      disabled={working}
                      onClick={() => setActiveAssetId(asset.id)}
                      aria-label="Open asset details"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Open
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 bg-black/60 hover:bg-black/80 backdrop-blur-sm border-white/10 text-xs"
                      disabled={!canQueue || criticalActionsBlocked}
                      onClick={() => toggleSelection(asset.id, !checked)}
                      aria-label={checked ? "Remove from upload queue" : "Save to upload queue"}
                    >
                      {checked ? <CheckCircle className="h-3.5 w-3.5 mr-1" /> : null}
                      {checked ? "Queued" : "Save to queue"}
                    </Button>
                  </div>

                  <div className="masonry-thumb" style={{ minHeight: assetHeight(asset) }}>
                    <div className="thumb" />
                    <div className="thumb" />
                    <div className="thumb" />
                    <div className="thumb" />
                  </div>

                  <div className="card-overlay">
                    <div className="overlay-content">
                      <p className="overlay-title">{asset.title || "Untitled metadata"}</p>
                      <div className="row">
                        <span className={statusClass(asset.status)}>{asset.status}</span>
                        <span className={metadataStatusClass(asset.metadataStatus)}>metadata: {asset.metadataStatus}</span>
                      </div>
                      <p className="overlay-meta truncate-2-lines">{asset.prompt}</p>
                    </div>
                  </div>

                  <div className="card-body" onClick={(e) => e.stopPropagation()}>
                    {mismatchMessage ? <p className="kpi">Degraded rendering: {mismatchMessage}</p> : null}
                    {asset.error ? <p className="error-inline">{asset.error}</p> : null}
                    <label className="row select-row">
                      <input
                        type="checkbox"
                        disabled={!canQueue || criticalActionsBlocked}
                        checked={checked}
                        onChange={(event) => toggleSelection(asset.id, event.target.checked)}
                      />
                      <span className="kpi">Queue for upload {asset.status === "failed" ? "(retry)" : ""}</span>
                    </label>
                  </div>
                </motion.article>
              );
            })}
          </Masonry>
          <div ref={feedSentinelRef} className="feed-sentinel" aria-hidden />
          {loadingMoreAssets ? <p className="kpi">Loading more assets...</p> : null}
          {!hasMoreAssets && assets.length > 0 ? <p className="kpi">End of gallery</p> : null}
        </motion.article>
      </section>

      <section className="split">
        <article className="panel section">
          <div className="row space-between section-title-row">
            <h2 className="section-title">Upload Queue</h2>
            <span className="kpi">{uploads.length} events</span>
          </div>
          <p className="kpi">Selected for upload: {selectedAssetIds.length}</p>
          <div className="queue-matrix">
            <span className="status status-empty">queued: {batchQueue.queued}</span>
            <span className="status status-processing">processing: {batchQueue.processing}</span>
            <span className="status status-ready">ready: {batchQueue.ready}</span>
            <span className="status status-uploading">uploading: {batchQueue.uploading}</span>
            <span className="status status-uploaded">uploaded: {batchQueue.uploaded}</span>
            <span className="status status-failed">failed: {batchQueue.failed}</span>
          </div>

          {uploadSummary.failed > 0 && uploadSummary.uploaded > 0 ? (
            <div className="error-box">
              Partial batch result detected: uploaded {uploadSummary.uploaded}, failed {uploadSummary.failed}.
              <div className="row">
                <Button variant="outline" size="sm" disabled={working} onClick={selectFailedUploadsForRetry}>
                  Select failed for retry
                </Button>
              </div>
            </div>
          ) : null}

          {uploadGuardMessage ? (
            <div className="error-box">
              Queue guard: {uploadGuardMessage}
              <div className="row">
                <Button variant="outline" size="sm" disabled={working} onClick={() => void onStartUpload()}>
                  Retry enqueue
                </Button>
                <Button variant="outline" size="sm" disabled={working} onClick={() => void loadAll()}>
                  Manual refresh
                </Button>
                <a className="btn btn-quiet" href={OPS_ROUTE_PATH} rel="noreferrer" target="_blank">
                  Open ops status
                </a>
              </div>
            </div>
          ) : null}

          <Button
            className="mt-2"
            disabled={working || selectedAssetIds.length === 0 || criticalActionsBlocked}
            onClick={() => void onStartUpload()}
          >
            {working ? "Uploading..." : "Start Adobe Upload"}
          </Button>

          <div className="queue-list queue-list-spaced">
            {uploads.length === 0 ? <div className="status status-empty">Upload queue empty</div> : null}
            {uploads.map((upload) => (
              <article className="queue-item" key={upload.id}>
                <div className="row space-between">
                  <strong>{upload.assetId}</strong>
                  <span className={`status status-${upload.status}`}>{upload.status}</span>
                </div>
                {upload.error ? <p className="error-inline">{upload.error}</p> : null}
                <p className="kpi">{new Date(upload.updatedAt).toLocaleTimeString()}</p>
              </article>
            ))}
          </div>
        </article>
      </section>

      {activeAsset ? (
        <div className="lightbox" role="dialog" aria-modal="true">
          <div className="lightbox-card panel">
            <div className="row space-between">
              <h2 className="section-title">Asset Editor</h2>
              <Button variant="outline" size="sm" onClick={() => setActiveAssetId(null)} type="button">
                Close
              </Button>
            </div>
            <div className="editor-layout">
              <div className="editor-preview">
                <div className="editor-image" />
                <p className="kpi">{activeAsset.prompt}</p>
                <div className="row">
                  <span className={statusClass(activeAsset.status)}>{activeAsset.status}</span>
                  <span className={metadataStatusClass(activeAsset.metadataStatus)}>
                    metadata: {activeAsset.metadataStatus}
                  </span>
                </div>
              </div>

              <div className="editor-fields">
                {getContractMismatch(activeAsset.error) ? (
                  <p className="kpi">
                    Contract mismatch detected. Editor remains available with fallback values.
                  </p>
                ) : null}
                <label className="field">
                  Title
                  <input
                    className="input"
                    value={editorTitle}
                    onChange={(event) => setEditorTitle(event.target.value)}
                    placeholder="Stock title"
                  />
                </label>
                <label className="field">
                  Tags (comma-separated)
                  <textarea
                    className="textarea"
                    value={editorTags}
                    onChange={(event) => setEditorTags(event.target.value)}
                    placeholder="family, lifestyle, daylight"
                  />
                </label>
                <div className="row">
                  <Button disabled={working || criticalActionsBlocked} onClick={() => void onSaveMetadata()} type="button">
                    {working ? "Saving..." : "Save metadata"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={working || criticalActionsBlocked}
                    onClick={() => void onRegenerateMetadata(activeAsset.id)}
                    type="button"
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="outline"
                    disabled={working || activeAsset.status !== "ready" || criticalActionsBlocked}
                    onClick={() => void onApprove(activeAsset.id)}
                    type="button"
                  >
                    Approve
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </SurfaceShell>
  );
}
