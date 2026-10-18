/* Offline shell for the installable app. Deliberately tiny: network-first so
 * live repository data is never stale, with the last good response kept as a
 * fallback. `/api` and `/mcp` are never intercepted — cached JSON would lie.
 *
 * ponytail: unbounded cache, no versioning. If asset caching ever needs
 * invalidating, hash the CACHE name on each deploy.
 */
const CACHE = "gittrace-shell";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/mcp")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches
          .open(CACHE)
          .then((cache) => cache.put(request, copy))
          .catch(() => {});
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        // A navigation while offline still gets the app shell.
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
