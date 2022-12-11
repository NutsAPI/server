
import { generateDtsBundle } from 'dts-bundle-generator';
import { build } from 'esbuild';
import { rm, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { dependencies } from './package.json';

(async () => {

  await rm('./dist', { recursive: true, force: true });
  
  await build({
    bundle: true,
    entryPoints: ['src/index.ts'],
    external: Object.keys(dependencies),
    minify: true,
    sourcemap: false,
    outdir: './dist',
    format: 'cjs',
    platform: 'node',
  });

  await writeFile(resolve('./dist/index.d.ts'),
    generateDtsBundle([
      {
        filePath: './src/index.ts',
        output: {
          exportReferencedTypes: false,
        },
      },
    ]),
  );

})();
