/**
 * The transport's actions as acture commands, bound to one player. Register them with an acture
 * registry; a palette, hotkeys, MCP or a gesture controller then all send the same commands.
 *
 * Continuous commands (`seekTo`, `setRate`, `setVolume`) take a target value and are idempotent, so
 * a sender may emit them at 60 Hz; they are listed in `CONTINUOUS_COMMAND_IDS` so history and undo
 * can skip them. Kept apart from `./transport` so the transport needs neither acture nor zod.
 */
import { z } from 'zod';
import { defineCommand, ok, err, type AnyCommandRecord } from 'acture';
import type { MediaItem, MediaPlayer } from './transport.js';

/** Commands that carry a target value and are safe at 60 Hz; history and undo should skip them. */
export const CONTINUOUS_COMMAND_IDS = ['media.seekTo', 'media.setRate', 'media.setVolume'] as const;

/** Builds the transport commands bound to one player. Register them with an acture registry. */
export function mediaCommands(player: MediaPlayer): AnyCommandRecord[] {
  const cat = 'media';
  const done = () => ok(undefined);
  return [
    defineCommand({ id: 'media.play', title: 'Play', category: cat, keybinding: 'Space',
      execute: async () => { await player.play(); return done(); } }),
    defineCommand({ id: 'media.pause', title: 'Pause', category: cat,
      execute: () => { player.pause(); return done(); } }),
    defineCommand({ id: 'media.toggle', title: 'Play or pause', category: cat, keybinding: 'k',
      execute: async () => { await player.toggle(); return done(); } }),
    defineCommand({ id: 'media.next', title: 'Next', category: cat, keybinding: 'n',
      execute: () => { player.next(); return done(); } }),
    defineCommand({ id: 'media.previous', title: 'Previous', category: cat, keybinding: 'p',
      execute: () => { player.previous(); return done(); } }),
    defineCommand({ id: 'media.skipBy', title: 'Skip by seconds', category: cat,
      params: z.object({ seconds: z.number() }),
      execute: (p: { seconds: number }) => { player.skipBy(p.seconds); return done(); } }),
    defineCommand({ id: 'media.seekTo', title: 'Seek to position', category: 'media.continuous',
      description: 'Absolute target in seconds; idempotent, safe to send at 60 Hz.',
      params: z.object({ seconds: z.number().min(0) }),
      execute: (p: { seconds: number }) => { player.seekTo(p.seconds); return done(); } }),
    defineCommand({ id: 'media.setRate', title: 'Set speed', category: 'media.continuous',
      params: z.object({ rate: z.number().positive() }),
      execute: (p: { rate: number }) => { player.setRate(p.rate); return done(); } }),
    defineCommand({ id: 'media.setVolume', title: 'Set volume', category: 'media.continuous',
      params: z.object({ volume: z.number().min(0).max(1) }),
      execute: (p: { volume: number }) => { player.setVolume(p.volume); return done(); } }),
    defineCommand({ id: 'media.enqueue', title: 'Add to queue', category: cat,
      params: z.object({ item: z.object({ id: z.string(), src: z.string(), title: z.string() }), next: z.boolean().optional() }),
      execute: (p: { item: MediaItem; next?: boolean }) => {
        if (!p.item.src) return err('invalid_item', 'src is required');
        player.enqueue(p.item, { next: p.next });
        return done();
      } }),
  ];
}
