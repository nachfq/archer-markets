// Validate the static docs artifact without installing the application or using RPC.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '_site');
const base = new URL('https://nachfq.github.io/archer-markets/');
const expected = [
  'index.html', 'how-it-works.html', 'testnet-release.html', 'demo.html',
  'assets/style.css', 'assets/archer-mark.png',
  'images/option-chain-v4.png', 'images/order-ticket-v4.png',
].sort();

async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Unexpected symlink: ${entry.name}`);
    const filename = path.join(directory, entry.name);
    files.push(...(entry.isDirectory() ? await filesIn(filename) : [filename]));
  }
  return files;
}

const files = (await filesIn(root)).map(file => path.relative(root, file)).sort();
assert.deepEqual(files, expected, 'Only the explicit public documentation may be published');
const htmlFiles = files.filter(file => file.endsWith('.html'));
const pages = new Map(await Promise.all(htmlFiles.map(async file => [
  file, await readFile(path.join(root, file), 'utf8'),
])));
const ids = new Map([...pages].map(([file, html]) => [
  file, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])),
]));

let checked = 0;
for (const [file, html] of pages) {
  assert(html.includes('<html lang="en">'), `Missing document layout: ${file}`);
  assert(!/<script\b/i.test(html), `Unexpected JavaScript: ${file}`);
  assert.equal([...html.matchAll(/aria-current="page"/g)].length, 1,
    `Exactly one navigation item should be active: ${file}`);
  for (const [, attribute, value] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    const url = new URL(value.replaceAll('&amp;', '&'), new URL(file, base));
    if (url.origin !== base.origin) continue;
    assert(url.pathname.startsWith(base.pathname), `Link escapes project base: ${file}: ${value}`);
    let target = decodeURIComponent(url.pathname.slice(base.pathname.length));
    if (!target || target.endsWith('/')) target += 'index.html';
    assert(files.includes(target), `Missing ${attribute}: ${file}: ${value}`);
    if (url.hash && pages.has(target)) {
      assert(ids.get(target).has(decodeURIComponent(url.hash.slice(1))),
        `Missing anchor: ${file}: ${value}`);
    }
    checked++;
  }
}
console.log(`Docs checked: ${htmlFiles.length} pages, ${checked} internal references, no extra published files.`);
