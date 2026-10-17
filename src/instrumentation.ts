/**
 * Runs once when the server starts. Starts the 网页监控 scheduler: every TICK minutes it asks the app's own
 * internal endpoint to check the pages that are due. Going through HTTP keeps this file free of server modules.
 * Set WATCH_SCHEDULER=off to disable (e.g. when an external cron calls /api/internal/watch-tick instead).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WATCH_SCHEDULER === "off" || !process.env.AUTH_SECRET) return;
  const g = globalThis as unknown as { watchTimer?: ReturnType<typeof setInterval> };
  if (g.watchTimer) return;

  const { tickKey } = await import("./lib/tick-key");
  const minutes = Math.max(1, Number(process.env.WATCH_TICK_MINUTES) || 10);
  const url = `http://127.0.0.1:${process.env.PORT || 3000}/api/internal/watch-tick`;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const res = await fetch(url, { method: "POST", headers: { "x-tick-key": tickKey() }, signal: AbortSignal.timeout(10 * 60_000) });
      if (!res.ok) console.warn(`[watch] tick failed: HTTP ${res.status}`);
    } catch (err) {
      console.warn("[watch] tick failed:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 60_000); // let the server finish starting
  g.watchTimer = setInterval(tick, minutes * 60_000);
}
