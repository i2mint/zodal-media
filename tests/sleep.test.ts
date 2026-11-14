import { createRegistry } from 'acture';
import { describe, expect, it } from 'vitest';
import { sleepCommands } from '../src/commands.js';
import { createSleepTimer, formatCountdown, type SleepPort } from '../src/sleep.js';

/** A fake port and clock: `play(ms)` advances both wall time and media time, then ticks. */
function rig({ duration = 600, fadeMs = 10_000 } = {}) {
  let wall = 0;
  const port = {
    currentTime: 0, duration, paused: false, ended: false, playbackRate: 1, volume: 0.8,
    pauses: 0,
    pause() { this.paused = true; this.pauses += 1; },
  } as SleepPort & { currentTime: number; paused: boolean; playbackRate: number; pauses: number };
  const timer = createSleepTimer(port, { fadeMs, now: () => wall, setTimer: () => 1, clearTimer: () => undefined });
  const play = (ms: number, step = 250) => {
    for (let done = 0; done < ms; done += step) {
      wall += step;
      if (!port.paused) port.currentTime += (step / 1000) * port.playbackRate;
      timer.tick();
    }
  };
  return { port, timer, play, idle: (ms: number) => { wall += ms; timer.tick(); } };
}

describe('createSleepTimer', () => {
  it('pauses after the listening minutes, fading the volume and restoring it', () => {
    const { port, timer, play } = rig();
    timer.set({ kind: 'after', minutes: 1 });
    expect(timer.get().remainingMs).toBe(60_000);
    play(55_000);
    expect(timer.get().fading).toBe(true);
    expect(port.volume).toBeGreaterThan(0.3);
    expect(port.volume).toBeLessThan(0.8);
    play(5_000);
    expect(port.pauses).toBe(1);
    expect(port.volume).toBe(0.8);
    expect(timer.get()).toMatchObject({ target: null, remainingMs: null, ended: 'slept' });
  });

  it('counts listening time only: a pause stops the countdown', () => {
    const { port, timer, play, idle } = rig();
    timer.set({ kind: 'after', minutes: 1 });
    play(20_000);
    port.pause();
    idle(10 * 60_000);
    expect(timer.get().remainingMs).toBe(40_000);
    port.paused = false;
    play(40_000);
    expect(timer.get().ended).toBe('slept');
  });

  it('pauses at a media time, estimating the time left at the current speed', () => {
    const { port, timer, play } = rig();
    port.playbackRate = 2;
    timer.set({ kind: 'at', seconds: 100, label: 'end of chapter' });
    expect(timer.get().remainingMs).toBe(50_000);
    play(50_000);
    expect(port.pauses).toBe(1);
    expect(timer.get().ended).toBe('slept');
  });

  it('pauses at the end of the item, once the duration is known', () => {
    const { port, timer, play } = rig({ duration: NaN });
    timer.set({ kind: 'end' });
    expect(timer.get().remainingMs).toBeNull();
    (port as { duration: number }).duration = 30;
    play(30_000);
    expect(timer.get().ended).toBe('slept');
  });

  it('a jump past the point cancels instead of pausing at once', () => {
    const { port, timer } = rig();
    timer.set({ kind: 'at', seconds: 100 });
    port.currentTime = 400;
    timer.tick();
    expect(port.pauses).toBe(0);
    expect(timer.get().ended).toBe('passed');
  });

  it('extend adds listening time and ends a fade; cancel restores the volume', () => {
    const { port, timer, play } = rig();
    timer.set({ kind: 'after', minutes: 1 });
    play(55_000);
    expect(timer.get().fading).toBe(true);
    timer.extend(5);
    expect(port.volume).toBe(0.8);
    expect(timer.get().fading).toBe(false);
    expect(timer.get().remainingMs).toBe(305_000);
    play(300_000);
    expect(timer.get().fading).toBe(true);
    timer.cancel();
    expect(port.volume).toBe(0.8);
    expect(timer.get().ended).toBe('cancelled');
  });

  it('extend on an `at` timer turns it into listening time', () => {
    const { timer } = rig();
    timer.set({ kind: 'at', seconds: 120 });
    timer.extend(1);
    expect(timer.get().target).toEqual({ kind: 'after', minutes: 3 });
  });

  it('fades through a host gain when one is given, and back to 1', () => {
    let wall = 0;
    const levels: number[] = [];
    const port = { currentTime: 0, duration: 600, paused: false, playbackRate: 1, volume: 1, pause() { this.paused = true; } };
    const timer = createSleepTimer(port, { gain: (l) => levels.push(l), now: () => wall, setTimer: () => 1, clearTimer: () => undefined });
    timer.set({ kind: 'after', minutes: 1 });
    for (let i = 0; i < 240; i++) { wall += 250; port.currentTime += 0.25; timer.tick(); }
    expect(port.volume).toBe(1);
    expect(levels.some((l) => l > 0 && l < 1)).toBe(true);
    expect(levels.at(-1)).toBe(1);
    expect(port.paused).toBe(true);
  });

  it('formats a countdown', () => {
    expect(formatCountdown(65_400)).toBe('1:06');
    expect(formatCountdown(90 * 60_000)).toBe('90:00');
  });
});

describe('sleepCommands', () => {
  it('drives the timer through a registry', async () => {
    const { timer } = rig();
    const registry = createRegistry();
    registry.registerAll(sleepCommands(timer));
    await registry.dispatch('sleep.after', { minutes: 10 });
    expect(timer.get().remainingMs).toBe(600_000);
    await registry.dispatch('sleep.at', { seconds: 30, label: 'end of chapter' });
    expect(timer.get().target).toEqual({ kind: 'at', seconds: 30, label: 'end of chapter' });
    await registry.dispatch('sleep.cancel');
    expect(timer.get().ended).toBe('cancelled');
    expect((await registry.dispatch('sleep.after', { minutes: -1 })).ok).toBe(false);
  });
});
