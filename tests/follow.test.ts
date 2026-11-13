import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachFollow, createFollow, scrollLineIntoContainer } from '../src/follow.js';

describe('createFollow (headless)', () => {
  it('stops on a hand scroll and comes back only when asked, by default (a transcript)', () => {
    const f = createFollow();
    f.handMoved();
    expect(f.get().following).toBe(false);
    f.resume();
    expect(f.get().following).toBe(true);
  });

  it('resumes by itself once the hand is still, never while a finger is down (lyrics)', () => {
    vi.useFakeTimers();
    try {
      const f = createFollow({ resumeAfterMs: 4000 });
      const seen: boolean[] = [];
      f.subscribe((s) => seen.push(s.following));
      f.fingerDown();
      f.handMoved();
      vi.advanceTimersByTime(10_000);
      expect(f.get().following).toBe(false); // the finger is still down
      f.fingerUp();
      vi.advanceTimersByTime(3999);
      expect(f.get().following).toBe(false);
      vi.advanceTimersByTime(1);
      expect(f.get().following).toBe(true);
      expect(seen).toEqual([false, true]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('attachFollow (DOM)', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  function panel() {
    const outer = document.createElement('div'); // stands for a sheet or a page around the panel
    const box = document.createElement('div');
    const lines = Array.from({ length: 20 }, (_, i) => {
      const p = document.createElement('p');
      p.textContent = `line ${i}`;
      box.appendChild(p);
      return p;
    });
    outer.appendChild(box);
    document.body.appendChild(outer);
    return { outer, box, lines };
  }

  it('scrolls only its own container, never an ancestor', () => {
    const { outer, box, lines } = panel();
    box.scrollTo = vi.fn();
    outer.scrollTo = vi.fn();
    const spy = vi.fn();
    lines[10].scrollIntoView = spy;
    const follow = createFollow();
    attachFollow(box, follow).bring(lines[10]);
    expect(box.scrollTo).toHaveBeenCalledOnce();
    expect(outer.scrollTo).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('hears hand scrolling on its container only, and not its own smooth scroll', () => {
    const { box, lines } = panel();
    box.scrollTo = vi.fn();
    let now = 0;
    const follow = createFollow();
    const view = attachFollow(box, follow, { now: () => now });
    window.dispatchEvent(new Event('wheel'));
    expect(follow.get().following).toBe(true); // the window is not the list
    view.bring(lines[3]);
    box.dispatchEvent(new Event('wheel'));
    expect(follow.get().following).toBe(true); // its own scroll, within the grace
    now = 5000;
    box.dispatchEvent(new Event('wheel'));
    expect(follow.get().following).toBe(false);
    view.bring(lines[4]);
    expect(box.scrollTo).toHaveBeenCalledOnce(); // not following: stays put
    view.bring(lines[4], true);
    expect(box.scrollTo).toHaveBeenCalledTimes(2);
    view.detach();
    follow.resume();
    box.dispatchEvent(new Event('wheel'));
    expect(follow.get().following).toBe(true); // detached
  });

  it('puts the line at the anchor of the container', () => {
    const { box, lines } = panel();
    Object.defineProperty(box, 'clientHeight', { value: 200 });
    box.getBoundingClientRect = () => ({ top: 100, height: 200 }) as DOMRect;
    lines[10].getBoundingClientRect = () => ({ top: 500, height: 20 }) as DOMRect;
    box.scrollTop = 50;
    box.scrollTo = vi.fn();
    scrollLineIntoContainer(box, lines[10], { anchor: 0.35, smooth: false });
    // 50 + (500 - 100) - (200 * 0.35 - 10) = 390
    expect(box.scrollTo).toHaveBeenCalledWith({ top: 390, behavior: 'auto' });
  });
});
