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

export interface EndPolicy {
  /** What `take` would decide now, without moving on (an "Up next" line). Stable until `take` or `reset`. */
  peek(mode: EndMode, ids: readonly string[], current: string): EndDecision;
  /** Decide at the end of `current`, and remember it (the shuffle's round). */
  take(mode: EndMode, ids: readonly string[], current: string): EndDecision;
  /** Forget the shuffle's round: call when the set changes to another one (a new list was played from). */
  reset(): void;
}

export interface EndPolicyOptions {
  /** A number in [0, 1): `Math.random` by default; a seeded one for tests. */
  random?: () => number;
}

const STOP: EndDecision = { kind: 'stop' };
const REPLAY: EndDecision = { kind: 'replay' };

/** The policy for one player. Every mode but shuffle is a pure function of the set and the current item. */
export function createEndPolicy({ random = Math.random }: EndPolicyOptions = {}): EndPolicy {
  /** Items played in this shuffle round. */
  let played = new Set<string>();
  /** The shuffle's pick for `after`, kept so `peek` and `take` agree and an "Up next" line does not flicker. */
  let picked: { after: string; id: string; wrapped: boolean } | null = null;

  const shufflePick = (ids: readonly string[], current: string): EndDecision => {
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

  return {
    peek: decide,
    take(mode, ids, current) {
      const d = decide(mode, ids, current);
      if (mode === 'shuffle') {
        // A new round: everything is fresh again, the item that just ended included (it only may not
        // start the round, which `others` already ensures).
        if (d.kind === 'play' && d.wrapped) played = new Set();
        else played.add(current);
      }
      picked = null;
      return d;
    },
    reset() { played = new Set(); picked = null; },
  };
}
