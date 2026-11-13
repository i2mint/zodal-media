# @zodal/media

Headless audio and media UI affordances for the zodal ecosystem: timed text (a transcript, song lyrics, subtitles) that follows the voice and plays from a tapped line, a seek-and-play that works on every engine, and a transport with a queue whose actions are commands.

```bash
pnpm add @zodal/media zustand
# for ./commands only: pnpm add acture zod
```

## A transcript or lyrics panel in a few lines

```ts
import { createTimedText, createFollow, attachFollow } from '@zodal/media';

const audio = document.querySelector('audio')!;
const panel = document.querySelector('.lyrics') as HTMLElement;     // the list's own scroll box
const lines = [...panel.querySelectorAll('p')] as HTMLElement[];

const follow = createFollow({ resumeAfterMs: 4000 });                // lyrics: come back by itself
const view = attachFollow(panel, follow, { anchor: 0.35 });          // scrolls the panel only
const text = createTimedText(cues, audio, { follow });               // cues: [{start, end, text, words?}]

text.subscribe((now, before) => {
  lines[before.cue]?.classList.remove('on');
  lines[now.cue]?.classList.add('on');
  view.bring(lines[now.cue]);
});
lines.forEach((line, i) => line.addEventListener('click', () => text.tapCue(i)));
audio.addEventListener('timeupdate', text.tick);
audio.addEventListener('seeked', text.tick);
```

A transcript plays from a tapped line (the default). A lyrics panel whose player lives elsewhere passes `playOnTap: false` and only moves there. `createFollow()` without `resumeAfterMs` never comes back by itself: show a "Back to now" button that calls `follow.resume()`.

## What is in it

| Subpath | What |
|---|---|
| `./cues` | `cueAt` (with a 10 ms tolerance, and `gaps: true` for subtitles), `wordAt`, `cuesDuration`, `formatTime`. Pure. |
| `./playback` | `seekThenPlay(el, t)` and `seekLanded(el)`: play from a chosen point, safely on Safari too (below). |
| `./follow` | `createFollow` (headless: following, finger-down hold, optional auto-resume) and `attachFollow` (one scroll container, never `scrollIntoView`). |
| `./timed-text` | `createTimedText(cues, port, options)`: the current cue and word, `tapCue`, `cancelHeldPlay`. |
| `./transport` | `createMediaPlayer(port)`: a zustand store with play, pause, seek, skip, rate, volume and a queue, over any `MediaPort`. |
| `./commands` | `mediaCommands(player)`: the transport's actions as [acture](https://www.npmjs.com/package/acture) commands, continuous ones marked. |

The root export is everything except `./commands`, so it needs neither acture nor zod.

## The trap it closes: tapping a line after the end

In WebKit (Safari, and every browser on an iPhone or iPad), `el.currentTime = t; el.play()` on a media element that has *ended* starts from the end, which ends again at once, or from 0, because the seek has not landed when `play()` runs. Chromium and Firefox apply the seek first. It showed as "after the overview finished, tapping the transcript played it from the start" (2026-11-13). `seekThenPlay` reads whether the element had ended before seeking and, if its seek is still landing, plays on `seeked`; a pause meanwhile cancels it (an `AbortSignal`). `createTimedText` and `createMediaPlayer` use it. Measured in Playwright WebKit: 12 of 12 taps restarted at 0 before, 16 of 16 played from the line after.

## Where it comes from

It pools the fleet's copies of the same ideas: `@zodal/speech` (i2mint/zodal-speech: the transcript player of spoken overviews, whose `./media` seed became `./transport`), arioso's lyrics navigator (container scroll at 35 %, auto-resume, finger hold), and srtplay (gaps between subtitles). The name and scope were decided in media_hub's research (`@zodal/media`, with `@zodal/speech` kept as a preset; i2mint/zodal-speech#4). The timed-text wire model belongs to lacing (`AlignedTrackV1`); this package reads cues structurally.

Next: `./media-session` (lock-screen controls with `setPositionState`), `./react` (`useMediaClock`, `<TimedText>`), `./waveform`, `./range` (loop, A–B), and `@zodal/speech` re-based on this package.

Part of [zodal](https://github.com/i2mint/zodal). MIT.
