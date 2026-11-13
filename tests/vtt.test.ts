import { describe, expect, it } from 'vitest';
import { parseWebVtt } from '../src/vtt.js';

describe('parseWebVtt', () => {
  it('reads cue blocks and skips the header, notes and styles', () => {
    const text = [
      '﻿WEBVTT - a talk',
      '',
      'NOTE made by hand',
      'over two lines',
      '',
      'STYLE',
      '::cue { color: red }',
      '',
      'intro',
      '00:00.000 --> 00:04.500 align:start',
      '<v Ana>Hello &amp; welcome,</v>',
      'everyone.',
      '',
      '01:02:03.25 --> 01:02:05.000',
      '<i>Later</i> on.',
      '',
    ].join('\r\n');
    expect(parseWebVtt(text)).toEqual([
      { start: 0, end: 4.5, text: 'Hello & welcome, everyone.', id: 'intro', speaker: 'Ana' },
      { start: 3723.25, end: 3725, text: 'Later on.' },
    ]);
  });

  it('reads SRT too: numbered blocks and a comma before the milliseconds', () => {
    const text = '2\n00:00:05,000 --> 00:00:06,000\nSecond\n\n1\n00:00:01,000 --> 00:00:02,000\nFirst\n';
    expect(parseWebVtt(text).map((c) => [c.start, c.text, c.id])).toEqual([
      [1, 'First', '1'],
      [5, 'Second', '2'],
    ]);
  });

  it('reads chapters: one title per cue', () => {
    const text = 'WEBVTT\n\n00:00:00.000 --> 00:10:00.000\nOpening\n\n00:10:00.000 --> 00:40:00.000\nThe engine\n';
    expect(parseWebVtt(text).map((c) => [c.start, c.text])).toEqual([
      [0, 'Opening'],
      [600, 'The engine'],
    ]);
  });

  it('skips a block without a timing line, and returns nothing for an empty text', () => {
    expect(parseWebVtt('WEBVTT\n\njust words\n\n')).toEqual([]);
    expect(parseWebVtt('')).toEqual([]);
  });
});
