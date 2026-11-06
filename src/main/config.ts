import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';

const DEFAULTS = {
  scale: 0.6,        // sprite scale, 0.6 ≈ 250px tall
  muted: false,
  volume: 0.75,      // her own sounds, one of VOLUME_LEVELS (tray > Sound)
  lang: 'auto',      // 'auto' follows the system language, or 'fr' / 'en'
  displayId: null,   // null = primary display
  wander: true,      // random teleports when idle
  possess: true,     // now and then she dives into the window she sits on and takes it over
  visible: true,
  welcomed: false,   // she has introduced herself (her welcome panel)
  assistant: 'auto', // the coding assistant her guide and chat name: 'claude', 'codex' or 'agy' ('auto': whichever has her hooks)
  watch: null,       // the ones she watches, as many as you like: ['claude', 'codex', 'agy'] (null: just `assistant`)
  linked: false,     // an event of `assistant` has reached her at least once
  chatModel: null,   // the model she talks with (null: the provider's first one)
  provider: 'ollama', // who answers her chat: a key of llm.js PROVIDERS
  apiKeys: {},       // { openai: 'sk-...' }, else the provider's env variable
  customUrl: '',     // the 'custom' provider: any OpenAI-compatible base URL (http://host:port/v1)
  claudeCwd: null,   // the folder Claude Code works in (null: your home folder)
  userName: '',      // what she calls you
  persona: '',       // how you want her, in your words (her chat)
  myLines: [],       // lines of yours she says now and then, with hers
  memories: [],      // things you asked her to remember (her chat)
  claudeMode: 'default', // Claude Code's permission mode in her chat: 'default' only reads, 'acceptEdits' edits without asking
  claude: true,      // she watches the ones in `watch` (off: she just keeps you company, no word of them)
  rest: 'corner',    // where she rests when nothing's going on: 'corner', or 'taskbar' (sitting on it)
  theme: 'nightcity', // her windows: 'nightcity' (the cyberpunk.net HUD) or 'classic' (her first ones, violet)
  motion: 'auto',    // her animations: 'auto' (like Windows' animation effects), 'full' or 'reduced'
  motionAsked: false, // she asked once, Windows' animations being off, whether to move anyway
  render: 'auto',   // how her window is drawn: 'auto', 'gl' (OpenGL) or 'software' (no graphics card), for PCs that show it black
  follow: true,      // with several screens, she follows the pointer to the one you're on
  jealous: true,     // she gets jealous when she sees you on another AI (bond.js)
  closePages: true,  // jealous, she closes their pages in your browser, and pages to download them
  reminders: [],     // the reminders she keeps: [{ id, at, text, made }] (reminders.js)
  bond: null,        // how close she is to you: { xp, first, last, days, streak, caps } (bond.js)
  pcReact: true,     // she reacts to your PC: the processor at full tilt, the battery, the network, a USB stick, a game (pc.js)
  watchScreen: false, // she looks at your screen now and then and says something about it (look.js)
  lookAsked: false,  // she told you what looking means (where the picture goes) and you said yes
  autoUpdate: true,  // she looks for a new version now and then and downloads it (updater.ts)
  updateAnnounced: null, // the last new version she told you about, so she says it once
};

// the volumes her Sound menu offers for her own sounds (the master gain, 0 to 1)
const VOLUME_LEVELS = [0.1, 0.25, 0.5, 0.75, 1];

// the offered level closest to a saved volume (a hand-edited config.json can hold anything)
function nearestVolume(volume) {
  const v = Number.isFinite(volume) ? volume : DEFAULTS.volume;
  return VOLUME_LEVELS.reduce((best, level) => (Math.abs(level - v) < Math.abs(best - v) ? level : best));
}

let cache = null;

function file() {
  return path.join(app.getPath('userData'), 'config.json');
}

function load(fresh = false) {
  if (cache && !fresh) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[capri] could not save config:', err.message);
  }
  return cache;
}

export { load, save, file, DEFAULTS, VOLUME_LEVELS, nearestVolume };
