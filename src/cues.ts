/**
 * Timed text, looked up by time: which cue and which word are being heard. Pure, no DOM.
 *
 * A cue is a span of text with a start and an end, in seconds, and optionally the times of its
 * words. A spoken overview's sentences (`@zodal/speech`), a song's lyric lines (arioso) and a
 * film's subtitles (srtplay) are all lists of cues. The shape is structural, so this module needs
 * no schema at runtime; the wire model is lacing's (`AlignedTrackV1`, media_hub ADR-0010).
 */

/** The fields of a cue this module reads. `words` are `[start, end, text]`, in seconds. */
export interface CueLike {
  start: number;
  end: number;
  text?: string;
  words?: ReadonlyArray<readonly [number, number, string]>;
}

/**
 * Tolerance so a seek to a cue's own start lands in that cue and not the one before it, after
 * float rounding (`currentTime` is rarely exactly what was set).
 */
export const CUE_EPSILON_S = 0.01;

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** The last index `i` of a sorted list with `startOf(i) <= time`, or -1. */
function lastStarted(count: number, startOf: (i: number) => number, time: number): number {
  let lo = 0;
  let hi = count - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (startOf(mid) <= time) {
      at = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return at;
}

export interface CueAtOptions {
  /** See `CUE_EPSILON_S`. */
  epsilonS?: number;
  /**
   * `false` (the default): the last cue that has started stays current through the gap after it,
   * as a transcript or lyrics view wants. `true`: -1 between cues, as subtitles want.
   */
  gaps?: boolean;
}

/** The index of the cue being heard at `time`: the last one that has started, or -1. */
export function cueAt(cues: readonly CueLike[], time: number, options: CueAtOptions = {}): number {
  const { epsilonS = CUE_EPSILON_S, gaps = false } = options;
  const at = lastStarted(cues.length, (i) => cues[i].start, time + epsilonS);
  if (gaps && at >= 0 && time >= cues[at].end) return -1;
  return at;
}

/** The index of the word being heard within `cue`, or -1 when it has no word times. */
export function wordAt(cue: CueLike | undefined, time: number): number {
  const words = cue?.words;
  if (!words?.length) return -1;
  return Math.max(0, lastStarted(words.length, (i) => words[i][0], time));
}

/** The cues' total length: the last cue's end, which stands in until the media reports its own. */
export function cuesDuration(cues: readonly CueLike[]): number {
  return cues.length ? cues[cues.length - 1].end : 0;
}

/** `m:ss`, or `h:mm:ss` past the hour. */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(whole / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
  const secs = whole % SECONDS_PER_MINUTE;
  const mm = hours && minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours ? `${hours}:` : ''}${mm}:${secs < 10 ? '0' : ''}${secs}`;
}
