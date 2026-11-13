/**
 * A timed text over a media port: which cue and word are being heard, and what a tap on a line
 * does. Renderer-agnostic; a transcript, a lyrics panel and a subtitle line all draw from it.
 *
 * A tap plays from the line by default (a transcript); `playOnTap: false` only moves there (a
 * lyrics panel whose player is elsewhere). Playing from a line uses `seekThenPlay`, so it plays
 * from the line on Safari too after the media has ended.
 */
import { cueAt, wordAt, type CueAtOptions, type CueLike } from './cues.js';
import { seekThenPlay, type SeekablePort } from './playback.js';
import type { Follow } from './follow.js';

/** The part of a media element a timed text uses. */
export interface TimedTextPort extends SeekablePort {
  readonly paused: boolean;
}

export interface TimedTextState {
  cue: number;
  word: number;
}

export interface TimedTextOptions extends CueAtOptions {
  /** A tap on a line plays from it (default) or only moves there. */
  playOnTap?: boolean;
  /** What starting playback means, to catch a refusal; defaults to `port.play()`. */
  play?: () => Promise<void> | void;
  /** A follow state to resume when a line is tapped. */
  follow?: Follow;
}

export interface TimedText {
  get(): TimedTextState;
  subscribe(listener: (state: TimedTextState, previous: TimedTextState) => void): () => void;
  /** Read the port's position; call on a frame while playing and on `seeked`. */
  tick(): void;
  /** A person chose line `index`. */
  tapCue(index: number): void;
  /** Cancel a play waiting for its seek (a pause tapped meanwhile). True if there was one. */
  cancelHeldPlay(): boolean;
}

export function createTimedText(cues: readonly CueLike[], port: TimedTextPort, options: TimedTextOptions = {}): TimedText {
  const { playOnTap = true, play, follow, ...lookup } = options;
  let state: TimedTextState = { cue: -1, word: -1 };
  const listeners = new Set<(state: TimedTextState, previous: TimedTextState) => void>();
  let held: AbortController | null = null;

  const tick = () => {
    const time = port.currentTime;
    const cue = cueAt(cues, time, lookup);
    const word = wordAt(cues[cue], time);
    if (cue === state.cue && word === state.word) return;
    const previous = state;
    state = { cue, word };
    listeners.forEach((l) => l(state, previous));
  };
  const cancelHeldPlay = () => {
    if (!held) return false;
    held.abort();
    held = null;
    return true;
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    tick,
    tapCue(index) {
      const cue = cues[index];
      if (!cue) return;
      follow?.resume();
      cancelHeldPlay();
      if (playOnTap && port.paused) {
        const mine = new AbortController();
        held = mine;
        seekThenPlay(port, cue.start, { play, signal: mine.signal }).then(
          () => { if (held === mine) held = null; },
          () => undefined, // cancelled, or refused: the host's `play` reports a refusal
        );
      } else {
        port.currentTime = cue.start;
      }
      tick();
    },
    cancelHeldPlay,
  };
}
