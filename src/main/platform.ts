// What changes from one system to the other, for the main process: which features exist here, the
// PATH a Mac app gets when opened from Finder, and macOS's Screen Recording permission.

import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { shell, systemPreferences, desktopCapturer } from 'electron';

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
// windows.ps1 (window positions, the AI in front, USB sticks, games): Windows only
const TRACKS_WINDOWS = WIN;

// A Mac app opened from Finder or at login gets a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin), so
// `claude`, `ollama` and `node` aren't found even though they work in a terminal. The usual places
// right away, then the login shell's own PATH (nvm, asdf, a custom ~/.zshrc) once it answers.
function addToPath(dirs: string[]) {
  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const added = dirs.filter((d) => d && !current.includes(d));
  if (added.length) process.env.PATH = [...current, ...added].join(path.delimiter);
}

function fixPath() {
  if (!MAC) return;
  const home = os.homedir();
  addToPath([
    '/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin',
    path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'),
    path.join(home, '.bun', 'bin'), path.join(home, '.volta', 'bin'), path.join(home, '.npm-global', 'bin'),
  ]);
  const loginShell = process.env.SHELL || '/bin/zsh';
  const MARK = '__CAPRI_PATH__';
  execFile(loginShell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], {
    timeout: 5000,
    env: { ...process.env, DISABLE_AUTO_UPDATE: 'true' }, // oh-my-zsh: no update check on the way
  }, (err, out) => {
    const found = !err && new RegExp(`${MARK}(.*)${MARK}`).exec(String(out))?.[1];
    if (found) addToPath(found.split(path.delimiter));
  });
}

const SCREEN_SETTINGS = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

// Can she take a picture of the screen? Always yes off macOS. On macOS without the Screen Recording
// permission, the picture only shows the wallpaper: the first ask lists her in System Settings (and
// macOS asks you), then System Settings opens on that page. Granted, she needs a restart to see.
async function canCaptureScreen() {
  if (!MAC) return true;
  if (systemPreferences.getMediaAccessStatus('screen') === 'granted') return true;
  await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => null);
  shell.openExternal(SCREEN_SETTINGS).catch(() => {});
  return false;
}

export { WIN, MAC, TRACKS_WINDOWS, fixPath, canCaptureScreen };
