/**
 * What plays when an item ends: one mode, chosen by the listener, applied to the set playback
 * started from (the list, filter, playlist or album the item was played from: its "play context").
 * Headless and pure apart from the shuffle's memory: no DOM, no zustand, no React.
 *
 * ```ts
 * const policy = createEndPolicy();
 * audio.addEventListener('ended', () => {
 *   const d = policy.take(mode, setIds, currentId);       // 'stop' | 'replay' | 'play' (an id)
 *   if (d.kind === 'play') open(d.id); else if (d.kind === 'replay') restart();
 * });
 * policy.peek(mode, setIds, currentId);                  // the same decision, for an "Up next" line
 * nextButton.onclick = () => act(policy.skip(mode, setIds, currentId));          // ▶|
 * prevButton.onclick = () => act(policy.back(mode, setIds, currentId, audio.currentTime)); // |◀
 * ```
 *
 * The five modes are the classic players' states folded into one choice (Android's and Apple's
 * repeat off / one / all plus shuffle on / off, and foobar2000's single "playback order" menu with
 * "stop after current"), named in words, because a cycling repeat button whose only difference
 * between two states is a tiny "1" is the most reported confusion in the genre. Research and the
 * decision: `docs/research/end-of-item-modes.md` in this repository.
 *
 * Choices, each a default the host can change:
 * - **Shuffle is a shuffle, not a die.** Every item of the set plays once, in random order, before
 *   any plays again; then a new round starts, never with the item that just ended. It goes on until
 *   the listener stops (or a sleep timer does). Items added to the set join the current round;
 *   items taken out are never picked.
 * - **Repeat one replays the item**; "In order" stops after the last item of the set; "Repeat all"
 *   wraps to the first. A set of one item under "Repeat all" or "Shuffle" replays it.
 * - **An item not in the set** (taken out of the playlist while it played): "In order" stops,
 *   "Repeat all" goes to the set's first item, "Shuffle" picks from the set.
 *
 * The transport's buttons follow the same set and mode, as every mainstream player does:
 * - **Next (▶|)** moves on now. "Repeat this one" and "Stop after this one" are about what happens
 *   when an item *ends*, so they do not trap the button: it goes to the next item of the list in
 *   order. Past the last item it wraps under "Repeat all", picks the next of the round under
 *   "Shuffle", and otherwise does nothing (a host disables the button: `peekSkip` says so).
 * - **Previous (|◀)** restarts the current item when more than `restartAfterS` (3 s, the CD-player
 *   rule) has played; otherwise it goes to the item before: the one played before it under
 *   "Shuffle", the one above it in the list otherwise, wrapping to the last under "Repeat all". With
 *   nothing before, it restarts.
 */

/** The modes, in the order a menu lists them (stop first, then the loops). */
export const END_MODES = ['stop', 'repeat-one', 'next', 'repeat-all', 'shuffle'] as const;
export type EndMode = (typeof END_MODES)[number];

/** The default: play on through the set, in order, and stop after its last item (a playlist played through). */
export const DEFAULT_END_MODE: EndMode = 'next';

export interface EndModeInfo {
  mode: EndMode;
  /** The menu's words: what happens when an item ends. */
  label: string;
  /** The word shown on the control beside its icon (always shown: the icon alone is ambiguous). */
  short: string;
  /** One sentence for a tooltip or a screen reader. */
  description: string;
  /** The standard icon's name in Material Symbols and in Lucide (a host draws it from either set). */
  icon: { material: string; lucide: string };
}

/** The terms and icons, one source for every host (chosen in `docs/research/end-of-item-modes.md`). */
export const END_MODE_INFO: Record<EndMode, EndModeInfo> = {
  stop: {
    mode: 'stop', label: 'Stop after this one', short: 'Then stop',
    description: 'When this item ends, playback stops.',
    icon: { material: 'keyboard_tab', lucide: 'arrow-right-to-line' },
  },
  'repeat-one': {
    mode: 'repeat-one', label: 'Repeat this one', short: 'Repeat 1',
    description: 'This item plays again from the start each time it ends.',
    icon: { material: 'repeat_one', lucide: 'repeat-1' },
  },
  next: {
    mode: 'next', label: 'Play the list in order', short: 'In order',
    description: 'The next item of the list plays; playback stops after the last one.',
    icon: { material: 'playlist_play', lucide: 'list-video' },
  },
  'repeat-all': {
    mode: 'repeat-all', label: 'Repeat the list', short: 'Repeat all',
    description: 'The list plays in order and starts again after its last item.',
    icon: { material: 'repeat', lucide: 'repeat' },
  },
  shuffle: {
    mode: 'shuffle', label: 'Shuffle the list', short: 'Shuffle',
    description: 'A random item of the list plays next; each plays once before any plays again.',
    icon: { material: 'shuffle', lucide: 'shuffle' },
  },
};

/** Whether a value is one of the modes (a persisted preference may hold an old or foreign value). */
export const isEndMode = (value: unknown): value is EndMode => (END_MODES as readonly unknown[]).includes(value);

/** The mode after `mode` in menu order, wrapping: for a single key or button that steps through them. */
export function nextEndMode(mode: EndMode): EndMode {
  return END_MODES[(END_MODES.indexOf(mode) + 1) % END_MODES.length];
}

/** What to do when the current item ends. */
export type EndDecision =
  | { kind: 'stop' }
  /** Play the current item again from its start. */
  | { kind: 'replay' }
  /** Play this item of the set; `wrapped`: the set starts over (repeat all past the end, a new shuffle round). */
  | { kind: 'play'; id: string; wrapped: boolean };

/** How far into an item (seconds) Previous restarts it instead of going to the item before: the CD-player rule. */
export const PREVIOUS_RESTARTS_AFTER_S = 3;

/**
 * The mode the Next button follows: the end-of-item mode, except that "Repeat this one" and
 * "Stop after this one" say what happens at an item's end, not where Next goes, so Next goes on in order.
 */
export const skipMode = (mode: EndMode): EndMode => (mode === 'stop' || mode === 'repeat-one' ? 'next' : mode);

export interface EndPolicy {
  /** What `take` would decide now, without moving on (an "Up next" line). Stable until `take` or `reset`. */
  peek(mode: EndMode, ids: readonly string[], current: string): EndDecision;
  /** Decide at the end of `current`, and remember it (the shuffle's round). */
  take(mode: EndMode, ids: readonly string[], current: string): EndDecision;
  /**
   * What `skip` would do now (Next, ▶|), without moving on: `stop` means there is nothing next (disable the button).
   * Under "Shuffle" this draws (and keeps) the pick, as `peek` does, so the button and an "Up next" line agree.
   */
  peekSkip(mode: EndMode, ids: readonly string[], current: string): EndDecision;
  /** Next (▶|): go on now, in the list's order (see `skipMode`), and remember it like `take`. */
  skip(mode: EndMode, ids: readonly string[], current: string): EndDecision;
  /**
   * Previous (|◀) at `position` seconds into `current`: `replay` (restart it) when past `restartAfterS`
   * or when nothing comes before, else the item before. `wrapped` here means it went round backwards (from the
   * first to the last under "Repeat all"), not that a new round starts. Under "Shuffle", Next and the end then
   * go forward again through the items Previous came back from, before any new pick.
   */
  back(mode: EndMode, ids: readonly string[], current: string, position: number): EndDecision;
  /**
   * Tell the policy the host opened `to` itself (a row tapped), from `from` (null: nothing was playing).
   * Call it on every open; the opens that carry out this policy's own decisions are recognised and skipped.
   * Under "Shuffle" Previous then comes back to `from`, and `to` counts as played this round.
   */
  opened(from: string | null, to: string): void;
  /** Forget the shuffle's round and what was played before: call when the set changes to another one (a new list was played from). */
  reset(): void;
}

export interface EndPolicyOptions {
  /** A number in [0, 1): `Math.random` by default; a seeded one for tests. */
  random?: () => number;
  /** Seconds into an item past which Previous restarts it (default `PREVIOUS_RESTARTS_AFTER_S`). */
  restartAfterS?: number;
}

const STOP: EndDecision = { kind: 'stop' };
const REPLAY: EndDecision = { kind: 'replay' };

/** At most this many items are remembered for Previous under "Shuffle". */
const HISTORY_LIMIT = 500;

/** The policy for one player. Every mode but shuffle is a pure function of the set and the current item. */
export function createEndPolicy({ random = Math.random, restartAfterS = PREVIOUS_RESTARTS_AFTER_S }: EndPolicyOptions = {}): EndPolicy {
  /** Items played in this shuffle round. */
  let played = new Set<string>();
  /** Under "Shuffle", the items moved on from, latest last: where Previous goes. */
  let history: string[] = [];
  /** Under "Shuffle", the items Previous came back from, latest last: where Next (and the end) go again first. */
  let forward: string[] = [];
  /** The shuffle's pick for `after`, kept so `peek` and `take` agree and an "Up next" line does not flicker. */
  let picked: { after: string; id: string; wrapped: boolean } | null = null;
  /** The item the policy's last move went to, so the host's `opened` call for that move is not counted twice. */
  let moved: string | null = null;
  /** Whether the last call was under "Shuffle": leaving or entering it forgets the shuffle's back and forth. */
  let shuffling = false;

  const enter = (mode: EndMode) => {
    const s = mode === 'shuffle';
    if (s !== shuffling) { history = []; forward = []; shuffling = s; }
  };
  const remember = (id: string) => {
    if (history[history.length - 1] !== id) history.push(id);
    if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  };
  /** The top of `forward` still worth going to (in the set, not the current item), dropping the others. */
  const forwardTop = (ids: readonly string[], current: string): string | null => {
    while (forward.length) {
      const id = forward[forward.length - 1];
      if (id !== current && ids.includes(id)) return id;
      forward.pop();
    }
    return null;
  };

  const shufflePick = (ids: readonly string[], current: string): EndDecision => {
    const again = forwardTop(ids, current);
    if (again) return { kind: 'play', id: again, wrapped: false };
    if (picked && picked.after === current && ids.includes(picked.id) && picked.id !== current) {
      return { kind: 'play', id: picked.id, wrapped: picked.wrapped };
    }
    const others = ids.filter((id) => id !== current);
    if (!others.length) return ids.includes(current) ? REPLAY : STOP;
    const fresh = others.filter((id) => !played.has(id));
    const wrapped = fresh.length === 0;
    const pool = wrapped ? others : fresh;
    const id = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    picked = { after: current, id, wrapped };
    return { kind: 'play', id, wrapped };
  };

  const decide = (mode: EndMode, ids: readonly string[], current: string): EndDecision => {
    enter(mode);
    if (mode === 'stop') return STOP;
    if (mode === 'repeat-one') return REPLAY;
    if (mode === 'shuffle') return shufflePick(ids, current);
    const i = ids.indexOf(current);
    if (mode === 'next') return i >= 0 && i + 1 < ids.length ? { kind: 'play', id: ids[i + 1], wrapped: false } : STOP;
    // repeat-all
    if (!ids.length) return STOP;
    if (i < 0) return { kind: 'play', id: ids[0], wrapped: false };
    if (ids.length === 1) return REPLAY;
    return i + 1 < ids.length ? { kind: 'play', id: ids[i + 1], wrapped: false } : { kind: 'play', id: ids[0], wrapped: true };
  };

  const take = (mode: EndMode, ids: readonly string[], current: string): EndDecision => {
    const d = decide(mode, ids, current);
    if (mode === 'shuffle') {
      if (d.kind === 'play' && forward[forward.length - 1] === d.id) forward.pop(); // forward again, through what Previous left
      // A new round: everything is fresh again, the item that just ended included (it only may not
      // start the round, which `others` already ensures).
      else if (d.kind === 'play' && d.wrapped) played = new Set();
      else played.add(current);
      if (d.kind === 'play') remember(current);
    }
    moved = d.kind === 'play' ? d.id : null;
    picked = null;
    return d;
  };

  const back = (mode: EndMode, ids: readonly string[], current: string, position: number): EndDecision => {
    enter(mode);
    moved = null;
    if (position > restartAfterS) return REPLAY;
    if (mode === 'shuffle') {
      // Back through what was played, skipping items that left the set (or the current one, met again).
      while (history.length) {
        const id = history.pop()!;
        if (id !== current && ids.includes(id)) {
          forward.push(current);
          picked = null;
          moved = id;
          return { kind: 'play', id, wrapped: false };
        }
      }
      return REPLAY;
    }
    const i = ids.indexOf(current);
    const d: EndDecision = i > 0 ? { kind: 'play', id: ids[i - 1], wrapped: false }
      // Under "Repeat all" the list goes round backwards too: from the first (or an item not in it) to the last.
      : mode === 'repeat-all' && ids.length > (i === 0 ? 1 : 0) ? { kind: 'play', id: ids[ids.length - 1], wrapped: i === 0 }
      : REPLAY;
    moved = d.kind === 'play' ? d.id : null;
    return d;
  };

  return {
    peek: decide,
    take,
    peekSkip: (mode, ids, current) => decide(skipMode(mode), ids, current),
    skip: (mode, ids, current) => take(skipMode(mode), ids, current),
    back,
    opened(from, to) {
      if (to === moved) { moved = null; return; } // the policy's own move, already counted
      moved = null;
      picked = null;
      forward = [];
      if (!shuffling) return;
      if (from && from !== to) remember(from);
      played.add(to);
    },
    reset() { played = new Set(); picked = null; history = []; forward = []; moved = null; },
  };
}
