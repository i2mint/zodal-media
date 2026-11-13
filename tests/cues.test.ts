import { describe, expect, it } from 'vitest';
import { cueAt, cuesDuration, formatTime, wordAt } from '../src/cues.js';

const CUES = [
  { start: 0, end: 2, text: 'One.' },
  { start: 2, end: 4, text: 'Two.', words: [[2, 2.5, 'Two'], [2.5, 4, 'more']] as [number, number, string][] },
  { start: 6, end: 9, text: 'Three.' },
];

describe('cueAt', () => {
  it('finds the last cue that has started', () => {
    expect(cueAt(CUES, -1)).toBe(-1);
    expect(cueAt(CUES, 0)).toBe(0);
    expect(cueAt(CUES, 3)).toBe(1);
    expect(cueAt(CUES, 100)).toBe(2);
  });

  it('lands a seek to a cue start in that cue despite float rounding', () => {
    // currentTime reads back a hair under what was set; arioso lit the previous line (2026-11-13 inventory)
    expect(cueAt(CUES, 1.9999)).toBe(1);
  });

  it('keeps the last cue through a gap, or not, as asked', () => {
    expect(cueAt(CUES, 5)).toBe(1);
    expect(cueAt(CUES, 5, { gaps: true })).toBe(-1);
    expect(cueAt(CUES, 3, { gaps: true })).toBe(1);
  });
});

describe('wordAt, cuesDuration, formatTime', () => {
  it('finds the word, or -1 without word times', () => {
    expect(wordAt(CUES[1], 2.1)).toBe(0);
    expect(wordAt(CUES[1], 3)).toBe(1);
    expect(wordAt(CUES[1], 1)).toBe(0);
    expect(wordAt(CUES[0], 1)).toBe(-1);
    expect(wordAt(undefined, 1)).toBe(-1);
  });

  it('measures and formats', () => {
    expect(cuesDuration(CUES)).toBe(9);
    expect(cuesDuration([])).toBe(0);
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(NaN)).toBe('0:00');
  });
});
