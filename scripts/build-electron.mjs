import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: watch,
  minify: !watch,
  external: ['electron'],
  logLevel: 'info'
};

const builds = [
  { ...shared, entryPoints: [path.join(root, 'electron/main.ts')], outfile: path.join(root, 'dist-electron/main.js') },
  { ...shared, entryPoints: [path.join(root, 'electron/preload.ts')], outfile: path.join(root, 'dist-electron/preload.js') }
];

if (watch) {
  for (const config of builds) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
  }
} else {
  await Promise.all(builds.map((config) => esbuild.build(config)));
}
