import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/index.js',
  sourcemap: true,
  format: 'cjs', // GitHub Actions runtime expects CommonJS
  banner: {
    js: '// Inkeep Agents Action - Bundled with esbuild',
  },
});

console.log('Build complete: dist/index.js');
