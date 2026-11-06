import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VOLUME_LEVELS, nearestVolume } from '../src/main/config';

// a browser module (no imports of its own), loaded as is without changing the package's module type
const browser = (name) => import(`data:text/javascript;base64,${fs.readFileSync(path.join(__dirname, `../src/renderer/js/${name}.js`)).toString('base64')}`);

test('her chat reads what you ask of her own sounds, in every language she speaks', async () => {
  const { askedLoudness } = await browser('loudness');
  const cases: [string, unknown][] = [
    ['set your sounds to 30%', { level: 0.3 }],
    ['your volume 80', { level: 0.8 }],
    ['mute your sounds', { mute: true }],
    ['turn your sounds back on', { mute: false }],
    ['your voice is too loud', { step: -1 }],
    ["you're so loud", { step: -1 }],
    ['make your sounds louder', { step: 1 }],
    ['mets tes sons à 40 %', { level: 0.4 }],
    ['coupe tes sons', { mute: true }],
    ['désactive tes sons', { mute: true }],
    ['réactive tes sons', { mute: false }],
    ['baisse ta voix', { step: -1 }],
    ['tu fais trop de bruit', { step: -1 }],
    ['tus sonidos al 20 %', { level: 0.2 }],
    ['desactiva tus sonidos', { mute: true }],
    ['activa tus sonidos', { mute: false }],
    ['baja tu voz', { step: -1 }],
    ['desliga seus sons', { mute: true }],
    ['liga seus sons', { mute: false }],
    ['abaixa sua voz', { step: -1 }],
    ['выключи свои звуки', { mute: true }],
    ['включи свои звуки', { mute: false }],
    ['твой голос тише', { step: -1 }],
    ['твои звуки на 0', { mute: true }],
  ];
  for (const [text, want] of cases) assert.deepEqual(askedLoudness(text), want, text);
});

test('your PC’s volume, and what isn’t a request, stay out of it', async () => {
  const { askedLoudness } = await browser('loudness');
  for (const text of [
    'volume 50', 'mets le son à 30 %', 'turn it up', 'baja el volumen', 'mute', // the PC's (chat.js)
    'how loud are your sounds?', 'I love your voice', // a question, a compliment: her answer
    'your sounds 150', // not a level
  ]) assert.equal(askedLoudness(text), null, text);
});

test('louder and quieter walk her Sound menu’s levels, and stop at their ends', async () => {
  const { stepVolume } = await browser('loudness');
  assert.equal(stepVolume(VOLUME_LEVELS, 0.75, 1), 1);
  assert.equal(stepVolume(VOLUME_LEVELS, 0.75, -1), 0.5);
  assert.equal(stepVolume(VOLUME_LEVELS, 0.3, 1), 0.5); // set in between from her chat
  assert.equal(stepVolume(VOLUME_LEVELS, 0.3, -1), 0.25);
  assert.equal(stepVolume(VOLUME_LEVELS, 1, 1), null);
  assert.equal(stepVolume(VOLUME_LEVELS, 0.1, -1), null);
  assert.equal(nearestVolume(0.7), 0.75);
  assert.equal(nearestVolume(Number.NaN), 0.75); // a broken config.json: the default
});

test('every language has her lines about her sounds, with the level in it', async () => {
  (globalThis as any).host = { platform: 'win32' };
  try {
    const { LINES } = await browser('lines');
    const keys = Object.keys(LINES.en.chat.loudness).sort();
    for (const [lang, lines] of Object.entries<any>(LINES)) {
      assert.deepEqual(Object.keys(lines.chat.loudness).sort(), keys, lang);
      assert.match(lines.chat.loudness.level, /\{level\}/, lang);
    }
  } finally {
    delete (globalThis as any).host;
  }
});
