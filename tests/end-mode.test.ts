import { createRegistry } from 'acture';
import { describe, expect, it } from 'vitest';
import { endModeCommands } from '../src/commands.js';
import { createEndPolicy, DEFAULT_END_MODE, END_MODE_INFO, END_MODES, isEndMode, nextEndMode, type EndMode } from '../src/end-mode.js';

const ids = ['a', 'b', 'c', 'd'];
/** A seeded generator, so a shuffle is repeatable. */
const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('end modes', () => {
  it('names every mode in words with a standard icon, and steps through them in menu order', () => {
    for (const m of END_MODES) {
      expect(END_MODE_INFO[m].mode).toBe(m);
      expect(END_MODE_INFO[m].short.length).toBeGreaterThan(0);
      expect(END_MODE_INFO[m].icon.material && END_MODE_INFO[m].icon.lucide).toBeTruthy();
    }
    expect(DEFAULT_END_MODE).toBe('next');
    expect(nextEndMode('stop')).toBe('repeat-one');
    expect(nextEndMode('shuffle')).toBe('stop');
    expect(isEndMode('repeat-all')).toBe(true);
    expect(isEndMode('repeat')).toBe(false);
  });

  it('stop stops, repeat one replays, in order goes on and stops after the last', () => {
    const p = createEndPolicy();
    expect(p.take('stop', ids, 'b')).toEqual({ kind: 'stop' });
    expect(p.take('repeat-one', ids, 'b')).toEqual({ kind: 'replay' });
    expect(p.take('next', ids, 'b')).toEqual({ kind: 'play', id: 'c', wrapped: false });
    expect(p.take('next', ids, 'd')).toEqual({ kind: 'stop' });
    expect(p.take('next', ids, 'gone')).toEqual({ kind: 'stop' });
  });

  it('repeat all wraps to the first, starts an unknown item at the first, and replays a set of one', () => {
    const p = createEndPolicy();
    expect(p.take('repeat-all', ids, 'c')).toEqual({ kind: 'play', id: 'd', wrapped: false });
    expect(p.take('repeat-all', ids, 'd')).toEqual({ kind: 'play', id: 'a', wrapped: true });
    expect(p.take('repeat-all', ids, 'gone')).toEqual({ kind: 'play', id: 'a', wrapped: false });
    expect(p.take('repeat-all', ['a'], 'a')).toEqual({ kind: 'replay' });
    expect(p.take('repeat-all', [], 'a')).toEqual({ kind: 'stop' });
  });

  it('shuffle plays every item once before any plays again, and never the one that just ended', () => {
    const p = createEndPolicy({ random: seeded() });
    let current = 'a';
    const order = [current];
    for (let n = 0; n < 3; n++) {
      const d = p.take('shuffle', ids, current);
      expect(d.kind).toBe('play');
      current = (d as { id: string }).id;
      order.push(current);
    }
    expect([...order].sort()).toEqual(ids); // one round: each once
    for (let n = 0; n < 40; n++) {
      const d = p.take('shuffle', ids, current);
      expect((d as { id: string }).id).not.toBe(current);
      current = (d as { id: string }).id;
    }
  });

  it('every round of a shuffle plays each item exactly once', () => {
    const p = createEndPolicy({ random: seeded(5) });
    let current = 'a';
    const seq = [current];
    for (let n = 0; n < ids.length * 6 - 1; n++) current = (p.take('shuffle', ids, current) as { id: string }).id, seq.push(current);
    // Rounds are found from the wraps: split where a take said `wrapped`.
    const q = createEndPolicy({ random: seeded(5) });
    let cur = 'a';
    let round = [cur];
    const rounds: string[][] = [];
    for (let n = 0; n < ids.length * 6 - 1; n++) {
      const d = q.take('shuffle', ids, cur) as { id: string; wrapped: boolean };
      if (d.wrapped) { rounds.push(round); round = []; }
      cur = d.id; round.push(cur);
    }
    expect(rounds.length).toBeGreaterThanOrEqual(4);
    for (const r of rounds) expect([...r].sort()).toEqual(ids);
    expect(seq.length).toBe(ids.length * 6);
  });

  it('a shuffle round starts over (wrapped) only once the set is used up', () => {
    const p = createEndPolicy({ random: seeded(3) });
    const two = ['a', 'b'];
    expect(p.take('shuffle', two, 'a')).toEqual({ kind: 'play', id: 'b', wrapped: false });
    expect(p.take('shuffle', two, 'b')).toEqual({ kind: 'play', id: 'a', wrapped: true });
    expect(p.take('shuffle', ['a'], 'a')).toEqual({ kind: 'replay' });
    expect(p.take('shuffle', ['b'], 'a')).toEqual({ kind: 'play', id: 'b', wrapped: expect.any(Boolean) });
  });

  it('peek shows what take will do, and stays put until then (an Up next line does not flicker)', () => {
    const p = createEndPolicy({ random: seeded(11) });
    const first = p.peek('shuffle', ids, 'a');
    expect(p.peek('shuffle', ids, 'a')).toEqual(first);
    expect(p.take('shuffle', ids, 'a')).toEqual(first);
  });

  it('items taken out of the set are never picked; items added join the round', () => {
    const p = createEndPolicy({ random: () => 0 });
    expect(p.take('shuffle', ['a', 'b', 'c'], 'a')).toEqual({ kind: 'play', id: 'b', wrapped: false });
    // b plays; c is taken out, e is added: the round goes on with e
    expect(p.take('shuffle', ['a', 'b', 'e'], 'b')).toEqual({ kind: 'play', id: 'e', wrapped: false });
    // the pick made for e is dropped if e leaves the set before it ends
    expect(p.peek('shuffle', ['a', 'e', 'f'], 'e')).toEqual({ kind: 'play', id: 'f', wrapped: false });
    expect(p.take('shuffle', ['a', 'e'], 'e')).toEqual({ kind: 'play', id: 'a', wrapped: true });
  });

  it('reset forgets the round (a new list was played from)', () => {
    const p = createEndPolicy({ random: () => 0 });
    p.take('shuffle', ['a', 'b', 'c'], 'a');
    p.reset();
    expect(p.take('shuffle', ['a', 'b', 'c'], 'b')).toEqual({ kind: 'play', id: 'a', wrapped: false });
  });

  it('end.setMode and end.cycle read and write the host-owned mode', async () => {
    let mode: EndMode = 'next';
    const r = createRegistry();
    let skips = 0;
    r.registerAll(endModeCommands({ get: () => mode, set: (m) => { mode = m; }, playNext: () => (skips += 1) < 2 }));
    expect((await r.dispatch('end.playNext') as { ok: boolean }).ok).toBe(true);
    expect((await r.dispatch('end.playNext') as { ok: boolean }).ok).toBe(false);
    await r.dispatch('end.setMode', { mode: 'shuffle' });
    expect(mode).toBe('shuffle');
    await r.dispatch('end.cycle');
    expect(mode).toBe('stop');
    const bad = await r.dispatch('end.setMode', { mode: 'loop' });
    expect((bad as { ok: boolean }).ok).toBe(false);
    expect(mode).toBe('stop');
  });
});
