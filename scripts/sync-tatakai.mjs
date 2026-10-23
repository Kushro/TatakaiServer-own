import { cp, mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(process.argv[2] || path.join(root, '..'));
const target = path.join(root, 'shared/tatakai');
const files = ['LICENSE', 'src/lib/utils.ts', 'src/core/extensions/sora/vm.ts',
  'src/core/extensions/mangayomi/vm.ts', 'src/core/extensions/mangayomi/dom.ts',
  'src/core/extensions/compatibility/abort.ts',
  ...['button', 'input', 'label', 'textarea', 'card', 'badge', 'alert'].map(name => `src/components/ui/${name}.tsx`)];
for (const file of files) {
  await mkdir(path.dirname(path.join(target, file)), { recursive: true });
  await copyFile(path.join(source, file), path.join(target, file));
}
await cp(path.join(source, 'desktop/runtime/compatibility'), path.join(target, 'desktop/runtime/compatibility'), { recursive: true });
const compiled = JSON.parse(await readFile(path.join(target, 'desktop/runtime/compatibility/aniyomi-compiled.json'), 'utf8'));
for (const file of Object.keys(compiled.sources)) {
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw Error('Invalid native source path');
  await mkdir(path.dirname(path.join(target, file)), { recursive: true });
  await copyFile(path.join(source, file), path.join(target, file));
}
// Source integrity checks must use files bundled beside the standalone runtime.
const nativeFile = path.join(target, 'desktop/runtime/compatibility/aniyomi.cjs');
await writeFile(nativeFile, (await readFile(nativeFile, 'utf8')).replace("path.join(__dirname, '../../..', name)", "path.join(__dirname, 'source', name)"));
await copyFile(path.join(source, 'LICENSE'), path.join(root, 'LICENSE'));
console.log('Updated the standalone Tatakai adapter/UI snapshot in shared/tatakai.');
