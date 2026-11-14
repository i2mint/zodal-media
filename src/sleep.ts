/**
 * A sleep timer: pause the media after some listening time, or at a point in it (the end of a
 * chapter, the end of the item), fading the volume out first so the stop does not wake anyone.
 * Headless: no DOM beyond an optional `timeupdate` listener on the port, no zustand, no React.
 *
 * ```ts
 * const sleep = createSleepTimer(audio);
 * sleep.set({ kind: 'after', minutes: 15 });   // 15 minutes of listening
 * sleep.set({ kind: 'at', seconds: 1260 });     // at 21:00 in the item (a chapter's end)
 * sleep.set({ kind: 'end' });                   // at the end of the item
 * sleep.extend(5); sleep.cancel();
 * sleep.subscribe((s) => render(s.remainingMs, s.fading));
 * ```
 *
 * Choices, each a default the host can change:
 * - **Listening time, not clock time.** `after` counts down only while the media plays: a person
 *   who paused is not asleep, and a timer that ran out during a pause would surprise them.
 * - **A fade** of `fadeMs` (10 s) before the pause; the volume is restored after the pause, after a
 *   cancel and after an extend, so the next play is at the volume the person chose. iOS ignores
 *   `volume` on a media element: there the fade has no audible effect and the pause still happens; a
 *   host that routes the element through Web Audio passes `gain` to fade a `GainNode` instead.
 * - **A jump past an `at` point cancels the timer** (reason `passed`) instead of pausing at once
 *   after a seek; a host that wants "the end of the chapter I am in now" sets it again.
 * - **Ticks from two clocks**: its own timer (smooth countdown) and the port's `timeupdate` when the
 *   port has one, because a phone throttles timers on a hidden page while the audio keeps playing.
 */

/** What the timer needs from a media element (an `HTMLMediaElement` is one). */
export interface SleepPort {
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended?: boolean;
  readonly playbackRate: number;
  volume: number;
  pause(): void;
  addEventListener?(type: 'timeupdate', listener: () => void): void;
  removeEventListener?(type: 'timeupdate', listener: () => void): void;
}

export type SleepTarget =
  /** After this many minutes of listening. */
  | { kind: 'after'; minutes: number }
  /** When playback reaches this media time (seconds); `label` names it for the UI ("end of chapter"). */
  | { kind: 'at'; seconds: number; label?: string }
  /** When playback reaches the end of the item. */
  | { kind: 'end' };

export type SleepEndReason = 'slept' | 'cancelled' | 'passed';

export interface SleepState {
  /** The target while the timer runs, `null` when it is off. */
  target: SleepTarget | null;
  /** Listening time left, in ms (an `at`/`end` target: estimated from media time and speed); `null` when off. */
  remainingMs: number | null;
  /** The volume is being lowered: the pause is less than `fadeMs` away. */
  fading: boolean;
  /** Why the last timer ended, until a new one is set. */
  ended: SleepEndReason | null;
}

export interface SleepTimerOptions {
  /** How long the fade before the pause lasts, in ms. Default 10 000; 0 for none. */
  fadeMs?: number;
  /** Countdown refresh while playing, in ms. Default 1000 (and every 100 ms while fading). */
  tickMs?: number;
  /** Set the fade level, 1 (full) to 0. Default: scale `port.volume`; pass a Web Audio gain setter on iOS. */
  gain?: (level: number) => void;
  /** Pause the media. Default `port.pause()`; a host passes its transport's pause or a command. */
  pause?: () => void;
  /** Clock and timers, for tests. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface SleepTimer {
  get(): SleepState;
  subscribe(listener: (state: SleepState, previous: SleepState) => void): () => void;
  set(target: SleepTarget): void;
  /** Add minutes: to an `after` timer's time left, or turn an `at`/`end` target into `after`. */
  extend(minutes: number): void;
  cancel(): void;
  /** Re-read the port; called by its own timer and on `timeupdate`. */
  tick(): void;
  dispose(): void;
}

export const DEFAULT_SLEEP_FADE_MS = 10_000;
export const DEFAULT_SLEEP_TICK_MS = 1000;
/** Minutes offered by a sleep-timer picker; a host may offer others. */
export const SLEEP_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90] as const;
/** A playhead step bigger than this (in media seconds per tick, at speed 1) is a jump, not playback. */
const JUMP_S = 3;
const END_EPSILON_S = 0.25;

const OFF: SleepState = { target: null, remainingMs: null, fading: false, ended: null };

export function createSleepTimer(port: SleepPort, options: SleepTimerOptions = {}): SleepTimer {
  const {
    fadeMs = DEFAULT_SLEEP_FADE_MS,
    tickMs = DEFAULT_SLEEP_TICK_MS,
    gain,
    pause = () => port.pause(),
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  } = options;

  let state: SleepState = OFF;
  const listeners = new Set<(s: SleepState, p: SleepState) => void>();
  const emit = (next: SleepState) => {
    const previous = state;
    state = next;
    listeners.forEach((l) => l(state, previous));
  };

  let leftMs = 0; // `after`: listening time left
  let lastAt = 0; // wall clock of the last tick
  let lastTime = 0; // media time of the last tick
  let volume: number | null = null; // the person's volume, held while fading
  let fadingNow = false;
  let handle: unknown = null;

  // The level of the fade, 1 to 0: a host's gain, or the element's volume scaled from where it was.
  const setLevel = (level: number) => {
    if (gain) { gain(level); fadingNow = level < 1; return; }
    if (level >= 1) {
      if (volume !== null) port.volume = volume;
      volume = null;
      return;
    }
    if (volume === null) volume = port.volume;
    port.volume = volume * level;
  };
  const restoreVolume = () => {
    if (gain) { if (fadingNow) gain(1); fadingNow = false; return; }
    setLevel(1);
  };
  const schedule = () => {
    if (handle !== null) clearTimer(handle);
    handle = state.target ? setTimer(tick, state.fading ? Math.min(100, tickMs) : tickMs) : null;
  };
  const stop = (reason: SleepEndReason) => {
    restoreVolume();
    if (handle !== null) clearTimer(handle);
    handle = null;
    emit({ ...OFF, ended: reason });
  };

  const mediaLeftMs = (seconds: number) =>
    (Math.max(0, seconds - port.currentTime) / (port.playbackRate || 1)) * 1000;

  function tick() {
    const target = state.target;
    if (!target) return;
    const t = now();
    const time = port.currentTime;
    const playing = !port.paused;
    let remaining: number;

    if (target.kind === 'after') {
      if (playing) leftMs -= Math.max(0, t - lastAt);
      remaining = leftMs;
    } else {
      const at = target.kind === 'at' ? target.seconds : port.duration;
      if (!Number.isFinite(at) || at <= 0) {
        remaining = Infinity; // `end` before the duration is known
      } else {
        const jumped = Math.abs(time - lastTime) > JUMP_S * Math.max(1, port.playbackRate) + (t - lastAt) / 1000;
        if (jumped && lastTime < at - END_EPSILON_S && time > at) {
          lastAt = t; lastTime = time;
          return stop('passed');
        }
        remaining = port.ended || time >= at - END_EPSILON_S ? 0 : mediaLeftMs(at);
      }
    }
    lastAt = t;
    lastTime = time;

    if (remaining <= 0) {
      if (playing) pause();
      return stop('slept');
    }
    const fading = playing && fadeMs > 0 && remaining <= fadeMs;
    if (fading) setLevel(remaining / fadeMs);
    else restoreVolume();
    emit({ target, remainingMs: Number.isFinite(remaining) ? Math.round(remaining) : null, fading, ended: null });
    schedule();
  }

  const onTimeupdate = () => tick();
  port.addEventListener?.('timeupdate', onTimeupdate);

  const timer: SleepTimer = {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(target) {
      restoreVolume();
      if (target.kind === 'after') leftMs = Math.max(0, target.minutes) * 60_000;
      lastAt = now();
      lastTime = port.currentTime;
      state = { ...OFF, target };
      tick();
    },
    extend(minutes) {
      const target = state.target;
      if (!target) return timer.set({ kind: 'after', minutes });
      const base = target.kind === 'after' ? leftMs : (state.remainingMs ?? 0);
      timer.set({ kind: 'after', minutes: (base + minutes * 60_000) / 60_000 });
    },
    cancel() {
      if (state.target) stop('cancelled');
    },
    tick,
    dispose() {
      port.removeEventListener?.('timeupdate', onTimeupdate);
      if (state.target) restoreVolume();
      if (handle !== null) clearTimer(handle);
      handle = null;
      listeners.clear();
    },
  };
  return timer;
}

/** "14:05" for a countdown in ms (minutes may exceed 59: "90:00"). */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
