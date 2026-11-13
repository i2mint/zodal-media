import { describe, expect, it, vi } from 'vitest';
import { seekThenPlay } from '../src/playback.js';
import { createMediaPlayer, type MediaPort } from '../src/transport.js';
import { createTimedText } from '../src/timed-text.js';

/**
 * An element that behaves like WebKit's (annals, 2026-11-13): a seek lands later (on `land()`),
 * and play() on an ended element whose seek has not landed starts from 0.
 */
function webkitLike(duration = 9) {
  let engineAt = duration;
  let target: number | null = null;
  const listeners = new Set<() => void>();
  const el = {
    duration,
    paused: true,
    ended: true,
    playbackRate: 1,
    volume: 1,
    get seeking() { return target !== null; },
    get currentTime() { return target ?? engineAt; },
    set currentTime(t: number) { target = t; this.ended = false; },
    play: vi.fn(function (this: { paused: boolean }) {
      if (target !== null) target = null, engineAt = 0; // the trap: the pending seek is lost
      el.paused = false;
      return Promise.resolve();
    }),
    pause() { el.paused = true; },
    addEventListener: (_: 'seeked', f: () => void) => { listeners.add(f); },
    removeEventListener: (_: 'seeked', f: () => void) => { listeners.delete(f); },
    /** The seek lands: the engine moves and `seeked` fires. */
    land() {
      if (target === null) return;
      engineAt = target; target = null;
      [...listeners].forEach((f) => f());
    },
    get engineAt() { return engineAt; },
  };
  return el;
}

describe('seekThenPlay', () => {
  it('plays from the chosen point after the end, once the seek has landed', async () => {
    const el = webkitLike();
    const done = seekThenPlay(el, 4);
    expect(el.play).not.toHaveBeenCalled();
    el.land();
    await done;
    expect(el.play).toHaveBeenCalledOnce();
    expect(el.engineAt).toBe(4);
  });

  it('plays at once, inside the tap, when the element had not ended', async () => {
    const el = webkitLike();
    el.ended = false;
    await seekThenPlay(el, 4);
    expect(el.play).toHaveBeenCalledOnce();
  });

  it('plays anyway when a seek ended without saying so', async () => {
    vi.useFakeTimers();
    try {
      const el = webkitLike();
      const done = seekThenPlay(el, 4, { timeoutMs: 100 });
      Object.defineProperty(el, 'seeking', { get: () => false }); // the source went away mid-seek
      vi.advanceTimersByTime(100);
      await done;
      expect(el.play).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('is what a timed text does when a line is tapped after the end', async () => {
    const el = webkitLike();
    const text = createTimedText([{ start: 0, end: 2 }, { start: 4, end: 9 }], el);
    text.tapCue(1);
    expect(el.play).not.toHaveBeenCalled();
    el.land();
    await new Promise((r) => setTimeout(r, 0));
    expect(el.play).toHaveBeenCalledOnce();
    expect(el.engineAt).toBe(4);
  });

  it('is what the media player does on seekTo then play after the end', async () => {
    const el = webkitLike();
    const player = createMediaPlayer(el as unknown as MediaPort);
    player.seekTo(4);
    const playing = player.play();
    el.land();
    await playing;
    expect(el.engineAt).toBe(4);
  });
});

describe('a play held for its seek', () => {
  it('is cancelled when the host cancels it (a pause tapped meanwhile)', async () => {
    const el = webkitLike();
    const text = createTimedText([{ start: 0, end: 9 }, { start: 4, end: 9 }], el);
    text.tapCue(1);
    expect(text.cancelHeldPlay()).toBe(true);
    el.land();
    await new Promise((r) => setTimeout(r, 0));
    expect(el.play).not.toHaveBeenCalled();
  });

  it('rejects with AbortError when its signal aborts', async () => {
    const el = webkitLike();
    const stop = new AbortController();
    const done = seekThenPlay(el, 4, { signal: stop.signal });
    stop.abort();
    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
    el.land();
    expect(el.play).not.toHaveBeenCalled();
  });

  it('keeps waiting past the timeout while the seek is still landing', async () => {
    vi.useFakeTimers();
    try {
      const el = webkitLike();
      const done = seekThenPlay(el, 4, { timeoutMs: 100 });
      vi.advanceTimersByTime(500);
      expect(el.play).not.toHaveBeenCalled();
      el.land();
      await done;
      expect(el.engineAt).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the media player', () => {
  it('stays paused when paused while a play waits for its seek', async () => {
    const el = webkitLike();
    const player = createMediaPlayer(el as unknown as MediaPort);
    player.seekTo(4);
    const playing = player.play();
    player.pause();
    el.land();
    await playing;
    expect(el.play).not.toHaveBeenCalled();
  });
});
