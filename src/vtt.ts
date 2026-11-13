/**
 * WebVTT (and SRT) text to cues. Pure, no DOM.
 *
 * Captions, a transcript or chapters often arrive as a `.vtt` file beside the audio: every
 * captioning tool writes it, and `<track kind="chapters">` uses the same format with one title
 * per cue. `parseWebVtt` reads the cue blocks and skips the header, `NOTE`, `STYLE` and `REGION`
 * blocks. It tolerates SRT too (numbered blocks, a comma before the milliseconds). Markup in a
 * cue's text is removed; a voice tag (`<v Ana>`) becomes the cue's `speaker`.
 */
import type { CueLike } from './cues.js';

/** A cue read from WebVTT: always with its text, and with its id and speaker when present. */
export interface VttCue extends CueLike {
  text: string;
  id?: string;
  speaker?: string;
}

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const MS_PER_SECOND = 1000;
const TIME = String.raw`(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})`;
const TIMING = new RegExp(String.raw`^\s*${TIME}\s+-->\s+${TIME}`);
const SKIPPED_BLOCKS = /^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/;
const VOICE = /<v(?:\.[^\s>]*)?\s+([^>]+)>/;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: ' ', lrm: '‎', rlm: '‏', quot: '"', apos: "'" };

function seconds(h: string | undefined, m: string, s: string, frac: string): number {
  return Number(h ?? 0) * SECONDS_PER_HOUR + Number(m) * SECONDS_PER_MINUTE + Number(s) + Number(frac.padEnd(3, '0')) / MS_PER_SECOND;
}

function plain(payload: string): string {
  return payload
    .replace(/<[^>]*>/g, '')
    .replace(/&(\w+);/g, (all, name: string) => ENTITIES[name] ?? all)
    .replace(/\s+/g, ' ')
    .trim();
}

/** The cues of a WebVTT (or SRT) text, in time order. Blocks without a timing line are skipped. */
export function parseWebVtt(text: string): VttCue[] {
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const cues: VttCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((line, i) => i > 0 || line.trim() !== '');
    if (!lines.length || SKIPPED_BLOCKS.test(lines[0])) continue;
    const at = lines.findIndex((line) => TIMING.test(line));
    if (at < 0 || at > 1) continue;
    const m = TIMING.exec(lines[at]) as RegExpExecArray;
    const payload = lines.slice(at + 1).join('\n');
    const cue: VttCue = {
      start: seconds(m[1], m[2], m[3], m[4]),
      end: seconds(m[5], m[6], m[7], m[8]),
      text: plain(payload),
    };
    if (at === 1 && lines[0].trim()) cue.id = lines[0].trim();
    const voice = VOICE.exec(payload);
    if (voice) cue.speaker = voice[1].trim();
    cues.push(cue);
  }
  return cues.sort((a, b) => a.start - b.start);
}
