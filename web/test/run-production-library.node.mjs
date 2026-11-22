import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// This contract includes Vite services; compile its env imports before running in Node.
const web = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../../canvas-agent/package.json', import.meta.url));
const { build } = require('esbuild');
const entry = path.join(web, 'test/production-library.node.test.ts');
const out = path.resolve(web, '../.local/cache/production-library-tests/contract.test.mjs');
await mkdir(path.dirname(out), { recursive: true });
await build({
    entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'esm', target: 'node22',
    tsconfig: path.join(web, 'tsconfig.json'),
    define: { 'import.meta.env': '{"DEV":false}', 'import.meta.url': JSON.stringify(pathToFileURL(entry).href) },
    banner: { js: "import {createRequire as _require} from 'node:module'; const require = _require(import.meta.url);" },
    logLevel: 'error',
});
await import(pathToFileURL(out).href);
