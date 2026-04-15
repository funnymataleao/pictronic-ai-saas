"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SurfaceShell } from "@/components/surfaces/surface-shell";
import { useInfrastructureHealth } from "@/lib/api/use-infrastructure-health";
import { ApiError, api } from "@/lib/api/client";
import type { Project } from "@/lib/api/contracts";
import type { InfrastructureState } from "@/lib/api/health";
import { AuthButtons } from "@/components/auth/auth-buttons";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = typeof error.details === "string" && error.details.length > 0 ? ` (${error.details})` : "";
    return `${error.code}: ${error.message}${details}`;
  }
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

type ProjectsSurfaceProps = {
  previewInfraState?: InfrastructureState | null;
};

export function ProjectsSurface({ previewInfraState = null }: ProjectsSurfaceProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const {
    criticalActionsBlocked,
    autonomyInactive,
    recoveryFailed: recoveryFailedBlock,
    recoveryActive: recoveryInProgressBlock,
    refresh: refreshHealth
  } = useInfrastructureHealth();

  const effectiveRecoveryStatus = previewInfraState ?? (recoveryInProgressBlock ? "recovering" : recoveryFailedBlock ? "failed" : "healthy");
  const effectiveAutonomyInactive = previewInfraState ? false : autonomyInactive;
  const effectiveCriticalActionsBlocked =
    previewInfraState ? previewInfraState === "recovering" || previewInfraState === "failed" : criticalActionsBlocked;

  const trendingPrompts = useMemo(
    () => [
      "Cozy home office with natural light",
      "Minimalist healthcare consultation scene",
      "Business teamwork around laptop in modern office"
    ],
    []
  );

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      const items = await api.listProjects();
      setProjects(items);
      await refreshHealth();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || effectiveCriticalActionsBlocked) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createProject({ name: name.trim() });
      setProjects((prev) => [created, ...prev]);
      setName("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  const autonomyGuardMessage = effectiveAutonomyInactive
    ? "Protected automation is temporarily unavailable. New project creation is paused until service guardrails are restored."
    : null;
  const recoveryGuardMessage = effectiveRecoveryStatus === "failed"
    ? "System recovery did not complete. Project creation is paused until automatic recovery succeeds."
    : effectiveRecoveryStatus === "recovering"
      ? "System recovery is in progress. Project creation will automatically resume when stability is confirmed."
      : null;
  const experienceGuardMessage = recoveryGuardMessage ?? autonomyGuardMessage;

  return (
    <SurfaceShell
      title="Pictronic Projects"
      description="Desktop-first production workflow for stock content pipelines."
      actions={
        <div className="row gap-2">
          <Link className="btn btn-quiet" href="/admin">
            Admin Console
          </Link>
          <AuthButtons isAuthenticated />
        </div>
      }
    >
      {error ? <div className="error-box">Unable to refresh projects right now. Please retry.</div> : null}
      {experienceGuardMessage ? <div className="warning-box">{experienceGuardMessage}</div> : null}

      <div className="dashboard-layout mt-4">
        <div className="flex flex-col gap-4">
          <section className="panel section">
            <h2 className="section-title mb-4">Create New Project</h2>
            <form onSubmit={onCreate} className="flex flex-col gap-3">
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Project name (e.g. Modern Interior)..."
                aria-label="Project name"
                disabled={creating || effectiveCriticalActionsBlocked}
              />
              <div className="row">
                <Button 
                  disabled={creating || !name.trim() || effectiveCriticalActionsBlocked} 
                  type="submit"
                >
                  {creating ? "Creating..." : "Create Project"}
                </Button>
                <Button 
                  variant="outline"
                  disabled={loading} 
                  onClick={() => void loadProjects()} 
                  type="button"
                >
                  Refresh
                </Button>
              </div>
            </form>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="panel section flex-1">
            <div className="row space-between section-title-row">
              <h2 className="section-title">Projects</h2>
              <span className="kpi">{projects.length} total</span>
            </div>

            {loading && projects.length === 0 ? <p className="kpi">Loading projects...</p> : null}

            {!loading && projects.length === 0 ? (
              <div className="status status-empty">No projects yet</div>
            ) : (
              <div className="grid project-grid">
                {projects.map((project) => (
                  <Link className="card card-cosmic-link transition-colors" key={project.id} href={`/projects/${project.id}`}>
                    <div className="thumb-collage">
                      {(project.thumbnailUrls.length ? project.thumbnailUrls : ["a", "b", "c", "d"])
                        .slice(0, 4)
                        .map((url, index) => (
                          <div key={`${project.id}-${index}-${url}`} className="thumb" />
                        ))}
                    </div>
                    <div className="card-body">
                      <div className="row space-between">
                        <strong>{project.name}</strong>
                        <span className="kpi">{new Date(project.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="row">
                        <span className="kpi">Assets: {project.imagesCount}</span>
                        <span className="kpi">Approved: {project.approvedCount}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="panel section">
            <h2 className="section-title">Trending prompts</h2>
            <div className="grid prompt-grid">
              {trendingPrompts.map((prompt) => (
                <article key={prompt} className="queue-item">
                  <p className="prompt-text">{prompt}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </SurfaceShell>
  );
}
