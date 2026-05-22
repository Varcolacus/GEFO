// Server-side Sentry init for Next.js. Called once per worker by the
// runtime. NEXT_RUNTIME tells us whether we're booting the Node.js
// server or the (much more restricted) edge runtime.
//
// Gated on SENTRY_DSN — unset in development means no-op.
export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT ?? "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    });
  }
}

// Re-export so Next.js can wire up server-side request error capture.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
