/**
 * Following the voice: a list of timed lines that keeps the current one in view until a person
 * scrolls it, and how it comes back.
 *
 * Two parts. `createFollow` is the headless state (following or not, and when to resume by
 * itself), driven by plain calls and an injectable clock, so it is tested without a DOM.
 * `attachFollow` wires it to one scroll container: it scrolls *that container* with `scrollTo`
 * (never `scrollIntoView`, which also scrolls every ancestor: a sheet, a page around a frame), and
 * hears hand scrolling *on that container only*, not on the window.
 *
 * Both behaviours come from the fleet's two copies: `@zodal/speech` (own-scroll grace, a manual
 * "Back to now") and arioso's lyrics view (container scroll at 35 %, a finger down holds, resume
 * by itself 4 s after the hand is still). The differences are options, not forks.
 */

export interface FollowState {
  following: boolean;
}

export interface FollowOptions {
  /** Start following. */
  following?: boolean;
  /** Resume by itself this long after the hand is still; `null` never (a "Back to now" only). */
  resumeAfterMs?: number | null;
  /** The clock and the timer, for tests. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface Follow {
  get(): FollowState;
  subscribe(listener: (state: FollowState) => void): () => void;
  /** A person moved the list: stop following (and, with `resumeAfterMs`, plan the return). */
  handMoved(): void;
  /** A finger is on the list: never resume while it is down. */
  fingerDown(): void;
  fingerUp(): void;
  /** "Back to now", or a tap on a line: follow again at once. */
  resume(): void;
  /** Stops a planned resume; call when the view goes away. */
  dispose(): void;
}

export const DEFAULT_FOLLOW_OPTIONS = { following: true, resumeAfterMs: null } as const;

/** Creates the headless follow state. */
export function createFollow(options: FollowOptions = {}): Follow {
  const {
    following = DEFAULT_FOLLOW_OPTIONS.following,
    resumeAfterMs = DEFAULT_FOLLOW_OPTIONS.resumeAfterMs,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  } = options;
  let state: FollowState = { following };
  let fingerIsDown = false;
  let timer: unknown = null;
  const listeners = new Set<(state: FollowState) => void>();

  const set = (next: boolean) => {
    if (state.following === next) return;
    state = { following: next };
    listeners.forEach((l) => l(state));
  };
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const plan = () => {
    cancel();
    if (resumeAfterMs === null || fingerIsDown) return;
    timer = setTimer(() => {
      timer = null;
      set(true);
    }, resumeAfterMs);
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    handMoved() {
      set(false);
      plan();
    },
    fingerDown() {
      fingerIsDown = true;
      cancel();
    },
    fingerUp() {
      fingerIsDown = false;
      if (!state.following) plan();
    },
    resume() {
      cancel();
      set(true);
    },
    dispose: cancel,
  };
}

/** Keys that scroll a list, so pressing them is a person scrolling. */
export const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '] as const;

/**
 * Scrolls `container` so `line` sits at `anchor` (0 top, 0.5 middle) of its visible height.
 * Only the container moves. `smooth` falls back to instant under reduced motion.
 */
export function scrollLineIntoContainer(
  container: HTMLElement,
  line: HTMLElement,
  { anchor = 0.5, smooth = true }: { anchor?: number; smooth?: boolean } = {},
): void {
  const box = container.getBoundingClientRect();
  const at = line.getBoundingClientRect();
  // The page's own scroller reports its box as the whole document; its view is the window.
  const isPage = container === container.ownerDocument.scrollingElement;
  const viewTop = isPage ? 0 : box.top;
  const viewHeight = isPage ? container.ownerDocument.defaultView?.innerHeight ?? box.height : container.clientHeight;
  const top = container.scrollTop + (at.top - viewTop) - (viewHeight * anchor - at.height / 2);
  const calm = container.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = smooth && !calm ? 'smooth' : 'auto';
  if (typeof container.scrollTo === 'function') container.scrollTo({ top: Math.max(0, top), behavior });
  else container.scrollTop = Math.max(0, top);
}

export interface AttachFollowOptions {
  /** Where the current line sits in the container: arioso 0.35, a transcript 0.5. */
  anchor?: number;
  /** How long the list's own smooth scroll is not mistaken for a person's. */
  ownScrollMs?: number;
  /** Keys that mean a person is scrolling; leave out keys the host uses (arrows that seek). */
  scrollKeys?: readonly string[];
  now?: () => number;
}

export const DEFAULT_OWN_SCROLL_MS = 900;

export interface AttachedFollow {
  /** Bring `line` into view, if following. `force` brings it even when not (after a resume). */
  bring(line: HTMLElement | null | undefined, force?: boolean): void;
  detach(): void;
}

/**
 * Wires `follow` to one scroll `container`: hand scrolling there stops following; `bring` moves
 * only the container. For a page that scrolls as a whole, pass `document.scrollingElement`; the
 * hand listeners then go on the window, since a page's scroll events reach it there.
 */
export function attachFollow(container: HTMLElement, follow: Follow, options: AttachFollowOptions = {}): AttachedFollow {
  const { anchor = 0.5, ownScrollMs = DEFAULT_OWN_SCROLL_MS, scrollKeys = SCROLL_KEYS, now = () => Date.now() } = options;
  const doc = container.ownerDocument;
  const target: EventTarget = container === doc.scrollingElement ? doc.defaultView ?? container : container;
  let ownUntil = 0;
  const offs: Array<() => void> = [];
  const on = (type: string, fn: (e: Event) => void) => {
    target.addEventListener(type, fn, { passive: true });
    offs.push(() => target.removeEventListener(type, fn));
  };
  const byHand = () => {
    if (now() > ownUntil) follow.handMoved();
  };
  on('wheel', byHand);
  on('touchmove', byHand);
  on('touchstart', () => follow.fingerDown());
  on('touchend', () => follow.fingerUp());
  on('touchcancel', () => follow.fingerUp());
  on('keydown', (e) => {
    if (scrollKeys.includes((e as KeyboardEvent).key)) follow.handMoved();
  });
  return {
    bring(line, force = false) {
      if (!line || (!force && !follow.get().following)) return;
      ownUntil = now() + ownScrollMs;
      scrollLineIntoContainer(container, line, { anchor });
    },
    detach() {
      offs.forEach((off) => off());
      follow.dispose();
    },
  };
}
