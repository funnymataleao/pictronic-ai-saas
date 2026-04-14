"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep server error visible in dev logs for route stabilization triage.
    console.error("[app.error]", error);
  }, [error]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 12 }}>Application Error</h1>
      <p style={{ marginBottom: 16 }}>The app hit an unexpected runtime error.</p>
      <button type="button" onClick={() => reset()}>
        Retry
      </button>
    </main>
  );
}
