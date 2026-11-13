import { describe, expect, it, vi } from 'vitest';
import { createTimedText } from '../src/timed-text.js';
import { createFollow } from '../src/follow.js';

function port() {
  return { currentTime: 0, paused: true, play: vi.fn(function (this: { paused: boolean }) { this.paused = false; }), ended: false, seeking: false };
}
const CUES = [{ start: 0, end: 2, words: [[0, 1, 'a'], [1, 2, 'b']] as [number, number, string][] }, { start: 2, end: 5 }];

describe('createTimedText', () => {
  it('tracks the cue and word, and tells listeners only on a change', () => {
    const p = port();
    const text = createTimedText(CUES, p);
    const seen = vi.fn();
    text.subscribe(seen);
    p.currentTime = 1.5;
    text.tick();
    text.tick();
    expect(text.get()).toEqual({ cue: 0, word: 1 });
    expect(seen).toHaveBeenCalledOnce();
  });

  it('plays from a tapped line, and resumes following', () => {
    const p = port();
    const follow = createFollow();
    follow.handMoved();
    const text = createTimedText(CUES, p, { follow });
    text.tapCue(1);
    expect(p.currentTime).toBe(2);
    expect(p.play).toHaveBeenCalledOnce();
    expect(text.get().cue).toBe(1);
    expect(follow.get().following).toBe(true);
  });

  it('only moves there with playOnTap off (a lyrics panel)', () => {
    const p = port();
    const text = createTimedText(CUES, p, { playOnTap: false });
    text.tapCue(1);
    expect(p.currentTime).toBe(2);
    expect(p.play).not.toHaveBeenCalled();
  });

  it('ignores a tap on no line', () => {
    const p = port();
    createTimedText(CUES, p).tapCue(9);
    expect(p.play).not.toHaveBeenCalled();
  });
});
