"use client";

// Root-level boundary: catches unhandled errors in the root layout itself
// (above `error.tsx`). Must render its own <html>/<body>. Kept dependency-free
// so it still renders even when app chunks/data failed to load.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#ededed",
          fontFamily: "ui-sans-serif, system-ui, Arial, sans-serif",
        }}
      >
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40, lineHeight: 1 }}>🗼</div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "12px 0 4px" }}>
            出了点问题
          </h1>
          <p style={{ fontSize: 14, color: "#a1a1aa", lineHeight: 1.6, margin: 0 }}>
            服务可能暂时不可用。稍等片刻后重试，通常会自动恢复。
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
            <button
              onClick={() => reset()}
              style={{
                border: 0,
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 500,
                background: "#fafafa",
                color: "#18181b",
                cursor: "pointer",
              }}
            >
              重试
            </button>
            <a
              href="/projects"
              style={{
                border: "1px solid #3f3f46",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                color: "#d4d4d8",
                textDecoration: "none",
              }}
            >
              返回我的项目
            </a>
          </div>
          {error?.digest ? (
            <p style={{ fontSize: 11, color: "#52525b", marginTop: 16 }}>
              反馈此编号以便排查：{error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
