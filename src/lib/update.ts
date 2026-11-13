// GitHub Pages lets browsers cache the page for ~10 minutes, so after an update some people would
// keep running an old version. On start, when the tab comes back into view, and every few minutes,
// we ask for version.json (bypassing all caches). If a newer build exists, we reload onto it.
declare const __BUILD_ID__: string;

let checking = false;
async function check() {
  if (checking || import.meta.env.DEV) return;
  checking = true;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = await res.json();
    if (!build || build === __BUILD_ID__) return;
    // Guard against a reload loop if a CDN keeps serving the old page for a moment.
    const tried = sessionStorage.getItem('dinetogether:reloaded-for');
    if (tried === build) return;
    sessionStorage.setItem('dinetogether:reloaded-for', build);
    // A new query string makes the browser fetch a fresh page (the #/g/… part is kept).
    location.replace(`${location.pathname}?v=${build}${location.hash}`);
  } catch { /* offline: keep running what we have */ } finally { checking = false; }
}

export function keepUpToDate() {
  void check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(); });
  setInterval(() => void check(), 5 * 60 * 1000);
}
