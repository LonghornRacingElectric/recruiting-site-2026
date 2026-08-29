import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

// Exceptions raised by code that is not ours, each of which was filing its
// own GitHub issue through PostHog's integration: the JavaScript bridges that
// in-app browsers (Instagram, LinkedIn) inject on Android and iOS, and
// Next.js complaining when a tab loaded before a deploy navigates after it.
const IGNORED_EXCEPTION_PATTERNS = [
  /Error invoking postMessage/, // Android WebView bridge
  /window\.webkit\.messageHandlers/, // iOS WKWebView bridge
  /router state header was sent but could not be parsed/, // Next.js deploy skew
];

function isIgnoredException(properties: Record<string, unknown> | undefined): boolean {
  const list = (properties?.$exception_list as Array<{ type?: string; value?: string }> | undefined) ?? [];
  const text = [
    ...list.map((e) => `${e.type ?? ""} ${e.value ?? ""}`),
    String(properties?.$exception_message ?? ""),
  ].join(" ");
  return IGNORED_EXCEPTION_PATTERNS.some((re) => re.test(text));
}

if (!token || !host) {
  // Warn, never throw: analytics is optional locally, and .env.example ships
  // these blank, so a throw here greeted every fresh checkout with a crash on
  // first page load. Production stays silent — the vars are set there.
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `PostHog disabled: ${!token ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN" : "NEXT_PUBLIC_POSTHOG_HOST"} is not set. Analytics and client error monitoring are off for this session.`
    );
  }
} else {
  posthog.init(token, {
    api_host: host,
    // Only capture exceptions in production — dev-server errors (HMR
    // hiccups, hydration warnings, work-in-progress crashes) would drown
    // real error monitoring.
    capture_exceptions: process.env.NODE_ENV === "production",
    before_send: (event) => {
      if (event?.event === "$exception" && isIgnoredException(event.properties)) return null;
      return event;
    },
    debug: process.env.NODE_ENV === "development",
  });
}
