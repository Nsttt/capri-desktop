import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseBattery } from '../src/main/system';

// A fresh copy of a browser module each time (a data: URL is cached by its content), loaded as if
// the preload had said it runs on `platform`.
let loads = 0;
async function linesOn(platform) {
  const file = path.join(__dirname, '../src/renderer/js/lines.js');
  const source = `${fs.readFileSync(file, 'utf8')}\n// ${platform} ${loads++}`;
  (globalThis as any).host = { platform };
  try {
    return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).LINES;
  } finally {
    delete (globalThis as any).host;
  }
}

// every path to a string, and the string there
function strings(value, at = ''): [string, string][] {
  if (typeof value === 'string') return [[at, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${at}[${i}]`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, at ? `${at}.${k}` : k));
  return [];
}

test('on a Mac she says ⌃⌥C, the menu bar and the keychain, and only changes lines that exist', async () => {
  const win = await linesOn('win32');
  const mac = await linesOn('darwin');
  for (const lang of Object.keys(win)) {
    const before = new Map(strings(win[lang]));
    const after = new Map(strings(mac[lang]));
    // the same keys: the Mac lines replace some, add none, lose none
    assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), lang);
    for (const key of ['showcase.chip', 'welcome.menu', 'welcome.readyHow']) {
      assert.match(before.get(key), /Ctrl\+Alt\+C/, `${lang} ${key} (Windows)`);
      assert.match(after.get(key), /⌃⌥C/, `${lang} ${key} (Mac)`);
    }
    for (const key of ['guide.icon.line', 'guide.icon.hidden', 'setup.wakeFailedHow', 'setup.pasteHow', 'motion.line']) {
      assert.notEqual(after.get(key), before.get(key), `${lang} ${key} unchanged on a Mac`);
    }
    // nothing about Windows' own pieces left where a Mac user reads it, but in what only Windows
    // ever shows: its settings pages (chat.ts asks for none elsewhere) and the winget install
    const WINDOWS_ONLY = ['chat.pc.pages.', 'setup.installHow'];
    const windowsy = [...after].filter(([key, text]) => /Ctrl\+Alt|Windows|\^/.test(text) && !WINDOWS_ONLY.some((k) => key.startsWith(k)));
    assert.deepEqual(windowsy, [], lang);
  }
});

test('pmset: a MacBook on battery, on the charger, full, and a Mac with no battery', () => {
  const batt = (line) => `Now drawing from 'Battery Power'\n -InternalBattery-0 (id=22675555)\t${line} present: true\n`;
  assert.deepEqual(parseBattery(batt('42%; discharging; 3:10 remaining')), { percent: 42, charging: false });
  assert.deepEqual(parseBattery(batt('77%; charging; 0:45 remaining')), { percent: 77, charging: true });
  assert.deepEqual(parseBattery(batt('100%; charged; 0:00 remaining')), { percent: 100, charging: true });
  assert.deepEqual(parseBattery(batt('80%; AC attached; not charging')), { percent: 80, charging: true });
  assert.deepEqual(parseBattery("Now drawing from 'AC Power'\n"), { none: true });
  assert.equal(parseBattery(''), null);
});
