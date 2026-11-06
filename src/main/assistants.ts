// The coding assistants she can watch, each through its own hooks: Claude Code, Codex and Antigravity.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as claude from '../../scripts/install-hooks';
import * as codex from '../../scripts/install-codex-hooks';
import * as agy from '../../scripts/install-hooks-agy';

const ASSISTANTS = {
  claude: { name: 'Claude Code', hooks: claude, help: 'https://code.claude.com/docs/en/quickstart' },
  codex: { name: 'Codex', hooks: codex, help: 'https://learn.chatgpt.com/docs/hooks' },
  agy: { name: 'Antigravity', hooks: agy, help: 'https://antigravity.google/docs/hooks' },
};

// Which one she watches: the one picked, else the one her hooks are in, else the one that's installed.
function resolveAssistant(preference) {
  if (ASSISTANTS[preference]) return preference;
  const codexHooks = codex.status();
  if (codexHooks.installed) return 'codex';
  if (claude.status().installed) return 'claude';
  if (agy.status().installed) return 'agy';
  return fs.existsSync(path.dirname(codexHooks.file)) ? 'codex' : 'claude';
}

function assistant(preference) {
  const id = resolveAssistant(preference);
  return { id, ...ASSISTANTS[id] };
}

const known = (ids) => [...new Set((Array.isArray(ids) ? ids : []).filter((id) => ASSISTANTS[id]))];

// The ones ticked in her Watch menu: as many as you like, so Claude Code, Codex and Antigravity
// can all be at work at once. A config from before (no list) watches the one picked.
function watchList(cfg) {
  const ticked = known(cfg.watch);
  return ticked.length ? ticked : [resolveAssistant(cfg.assistant)];
}

// The one her guide, her chat and her idle lines name: the one ticked last, while it's still ticked.
function primary(cfg) {
  const picked = resolveAssistant(cfg.assistant);
  const ticked = watchList(cfg);
  return ticked.includes(picked) ? picked : ticked[0];
}

// Ticking (on) or unticking one in her Watch menu: the config patch, and whether she should say
// hello and offer to plug herself into it (one she wasn't already talking about).
function toggleWatch(cfg, id, on) {
  const watching = cfg.claude === false ? [] : watchList(cfg);
  const first = primary(cfg);
  if (on) {
    if (watching.includes(id)) return { patch: {}, hello: false };
    const hello = id !== first;
    return { patch: { claude: true, watch: [...watching, id], assistant: id, ...(hello && { linked: false, welcomed: false }) }, hello };
  }
  const rest = watching.filter((other) => other !== id);
  if (!rest.length) return { patch: { claude: false }, hello: false }; // none left: she just keeps you company
  // she was talking about that one: now she talks about the next one
  return { patch: { watch: rest, ...(id === first && { assistant: rest[0] }) }, hello: false };
}

export { ASSISTANTS, assistant, resolveAssistant, watchList, primary, toggleWatch };
