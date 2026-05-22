// Browser-side Sentry init. Loaded automatically by Next.js when a file
// named `instrumentation-client.{ts,js}` exists at the project root.
//
// Gated on NEXT_PUBLIC_SENTRY_DSN — when unset (the default in
// development), this file is a no-op and the SDK never initialises.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    // 10% of transactions traced. Bump in production if you have headroom.
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Session replay is off by default — it has a real cost.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Required export for navigation tracing in the App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
