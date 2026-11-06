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

export { ASSISTANTS, assistant, resolveAssistant };
