/**
 * `@zodal/media`: the fleet's audio and media UI affordances, headless first.
 *
 * - `./cues`: timed text looked up by time (`cueAt`, `wordAt`, `formatTime`).
 * - `./vtt`: `parseWebVtt`, WebVTT or SRT captions and chapters to cues.
 * - `./playback`: `seekThenPlay`, playing from a chosen point safely on every engine.
 * - `./follow`: keep the current line in view until a person scrolls, scrolling one container.
 * - `./timed-text`: a timed text over a media port: current cue and word, tap a line.
 * - `./transport`: a headless player with a queue over any `MediaPort`.
 * - `./commands`: the transport's actions as acture commands (needs `acture` and `zod`).
 *
 * The root re-exports the pure parts (cues, vtt, playback, follow, timed text): no zustand, acture or
 * zod. Import the transport and the commands from their subpaths.
 */
export * from './cues.js';
export * from './vtt.js';
export * from './playback.js';
export * from './follow.js';
export * from './timed-text.js';
