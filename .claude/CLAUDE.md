# zodal-media: agent guide

`@zodal/media`: headless audio/media UI affordances (timed text, follow, safe seek-and-play, transport, commands). Satellite of the zodal ecosystem (`../.claude/CLAUDE.md`); never depends on another satellite (a React scrubber takes an injected slider, it does not import `@zodal/ui-shadcn`).

## Seams (v1)

| Seam | Default | Replacement pointed at |
|---|---|---|
| media element (`MediaPort`, `TimedTextPort`, `SeekablePort`) | an `HTMLMediaElement`, as is | srtplay's wall clock; thoremin's `Stretcher`; embed elements (i2mint/zodal-speech#4) |
| `createFollow({ resumeAfterMs })` | `null`: "Back to now" only (a transcript) | arioso lyrics: 4000 |
| `attachFollow(container, f, { anchor })` | 0.5 | arioso: 0.35 |
| `createTimedText(..., { playOnTap })` | `true` (a transcript) | arioso: `false` |
| `cueAt(..., { gaps })` | `false`: last cue stays lit | srtplay subtitles: `true` |

NOT seams: the cue wire model (lacing owns it, media_hub ADR-0010; cues are read structurally here), styling, the IIFE build (`@zodal/speech` keeps its own until it is re-based here).

## Rules

- Any code that seeks and then plays goes through `seekThenPlay`/`seekLanded` (`src/playback.ts`). The WebKit trap is in its module note; its regression tests are `tests/playback.test.ts` (a WebKit-like fake) and annals' `test_tapping_a_line_after_the_end_plays_from_that_line[webkit]` (real WebKit).
- Scroll one given container with `scrollTo`; never `scrollIntoView` (it scrolls every ancestor, a sheet or the page around a frame).
- Publish: `[publish]` in the squash subject, version bumped, `pnpm` only. The first publish of a new npm name is the owner's (trusted publisher attached after it exists).

## Commands

```bash
pnpm install && pnpm test && pnpm typecheck && pnpm build
```

Research behind it: `$PP/_agent_work/zodal/2026-11-13-zodal-audio/` (inventory.md, research-pool.md, synthesis).
