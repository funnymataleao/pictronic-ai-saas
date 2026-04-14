"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1 style={{ marginBottom: 12 }}>Fatal Application Error</h1>
        <p style={{ marginBottom: 16 }}>
          A global runtime error occurred. Check server logs for details.
        </p>
        <pre style={{ whiteSpace: "pre-wrap", marginBottom: 16 }}>{error.message}</pre>
        <button type="button" onClick={() => reset()}>
          Retry
        </button>
      </body>
    </html>
  );
}
