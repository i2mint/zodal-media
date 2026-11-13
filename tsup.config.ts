import { defineConfig } from 'tsup';

const entries = ['index', 'cues', 'playback', 'follow', 'timed-text', 'transport', 'commands'];

export default defineConfig({
  entry: Object.fromEntries(entries.map((e) => [e, `src/${e}.ts`])),
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  // A page has no `process`, and the bundled zustand reads it.
  define: { 'process.env.NODE_ENV': '"production"' },
});
