const NAVIGATED = "brinewar:navigate";

interface LinkLike {
  readonly href: string;
  readonly target: string;
  readonly download: boolean;
}

interface ClickLike {
  readonly button: number;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

interface Here {
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
}

export function routeOf(link: LinkLike, click: ClickLike, here: Here): string | null {
  if (click.defaultPrevented || click.button !== 0) return null;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if (link.download || (link.target !== "" && link.target !== "_self")) return null;
  let url: URL;
  try {
    url = new URL(link.href, here.origin);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  const last = url.pathname.split("/").pop() ?? "";
  if (last.includes(".") || url.pathname.startsWith("/api/")) return null;
  if (url.pathname === here.pathname && url.search === here.search && url.hash !== "") return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

const PAGES = /^\/(admiralty|treasury|fleet|fair-play|captains|docs|verify\/\d+|replay(?:\/\d+)?)$/;
const ALIASES: Readonly<Record<string, string>> = { "/judges": "/fair-play" };

export function canonicalPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  return ALIASES[path] ?? path;
}

export function pageKey(route: string): string {
  const path = canonicalPath(route.split(/[?#]/)[0] ?? "/");
  const page = PAGES.exec(path);
  if (page) return page[1] as string;
  return /^\/duel\//.test(path) || /[?&]duel=/.test(route) ? `play:${route}` : "play";
}

export function currentRoute(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function subscribeRoute(fn: () => void): () => void {
  window.addEventListener("popstate", fn);
  window.addEventListener(NAVIGATED, fn);
  return () => {
    window.removeEventListener("popstate", fn);
    window.removeEventListener(NAVIGATED, fn);
  };
}

function navigate(to: string): void {
  if (to !== `${currentRoute()}${window.location.hash}`) window.history.pushState(null, "", to);
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event(NAVIGATED));
  const raw = window.location.hash.slice(1);
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    id = raw;
  }
  if (id !== "") reveal(id, performance.now());
  else window.requestAnimationFrame(() => focusHeading(performance.now()));
}

const REVEAL_WAIT_MS = 3000;

function focusHeading(since: number): void {
  const h = document.querySelector("main h1, h1");
  if (h instanceof HTMLElement) {
    if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
    return;
  }
  if (performance.now() - since < REVEAL_WAIT_MS) window.requestAnimationFrame(() => focusHeading(since));
}

function reveal(id: string, since: number): void {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView();
    return;
  }
  if (performance.now() - since < REVEAL_WAIT_MS) window.requestAnimationFrame(() => reveal(id, since));
}

export function captureLinks(): () => void {
  const onClick = (e: MouseEvent): void => {
    const el = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!(el instanceof HTMLAnchorElement)) return;
    const to = routeOf({ href: el.href, target: el.target, download: el.hasAttribute("download") }, e, window.location);
    if (to === null) return;
    e.preventDefault();
    navigate(to);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
