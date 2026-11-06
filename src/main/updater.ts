// She keeps herself up to date, the way t3code and tracedecay do: a look at the GitHub releases now and
// then (30 s after she starts, then every 4 hours), the new version downloaded in the background, and put
// in when you pick "Restart to update" in her menu, or the next time she quits.
//
// Windows: electron-updater and the NSIS installer, from latest.yml.
// macOS: the build is only signed ad hoc, and Squirrel.Mac (electron-updater's way on a Mac) refuses an
// update that isn't signed by the same identity as the app running. So the zip listed in latest-mac.yml
// is fetched here, checked against its sha512, unpacked, checked again (bundle id, version, signature),
// then swapped in for the old app by a small script once she has quit.
//
// Where the feed lives comes from app-update.yml, which electron-builder writes into the app from
// package.json › build.publish. CAPRI_UPDATE_FEED=<url of a folder with the release files> points a
// packaged build at another feed, to try an update without publishing one. CAPRI_DISABLE_AUTO_UPDATE=1
// turns it all off.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { once } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { app, net } from 'electron';
import { NsisUpdater } from 'electron-updater';
import { WIN, MAC } from './platform';
import { parseFlat, parseFeed, isNewer, pickMacZip } from './update-feed';
import type { Feed } from './update-feed';

const run = promisify(execFile);

const FIRST_CHECK = 30_000;
const EVERY = 4 * 60 * 60_000;

type UpdateState =
  | { status: 'off'; reason: string }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  // a newer version this copy can't put in itself (a Mac app outside a folder she can write to)
  | { status: 'manual'; version: string; page: string }
  | { status: 'error'; error: string };

type Source = { manifest: (name: string) => string; file: (version: string, name: string) => string; page: string; generic?: string };

interface Backend {
  latest(): Promise<string | null>; // a version newer than this one, or null
  blocked(): string | null; // why it can't be put in here, if it can't
  download(version: string, progress: (percent: number) => void): Promise<void>;
  install(relaunch: boolean): void;
}

function source(): Source | { off: string } {
  if (process.env.CAPRI_DISABLE_AUTO_UPDATE === '1') return { off: 'CAPRI_DISABLE_AUTO_UPDATE' };
  if (!app.isPackaged) return { off: 'not packaged' };
  if (!WIN && !MAC) return { off: `no updates on ${process.platform}` };
  const override = process.env.CAPRI_UPDATE_FEED;
  if (override) {
    const base = override.replace(/\/?$/, '/');
    return { manifest: (name) => base + name, file: (_v, name) => base + name, page: base, generic: base };
  }
  try {
    const cfg = parseFlat(fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8'));
    if (cfg.provider !== 'github' || !cfg.owner || !cfg.repo) return { off: 'no GitHub feed in app-update.yml' };
    const repo = `https://github.com/${cfg.owner}/${cfg.repo}`;
    return {
      manifest: (name) => `${repo}/releases/latest/download/${name}`,
      file: (version, name) => `${repo}/releases/download/v${version}/${encodeURIComponent(name)}`,
      page: `${repo}/releases/latest`,
    };
  } catch {
    return { off: 'no app-update.yml' };
  }
}

// --- Windows: electron-updater does it all ---

function windowsBackend(src: Source): Backend {
  const updater = new NsisUpdater(src.generic ? { provider: 'generic', url: src.generic } : undefined);
  updater.autoDownload = false; // downloaded by check(), so it can report how far along it is
  updater.autoInstallOnAppQuit = true; // downloaded but not put in yet: done silently when she quits
  updater.logger = null;
  updater.on('error', () => {}); // reported through the promises below; unheard, an 'error' event would throw
  let onProgress = null;
  updater.on('download-progress', (p) => onProgress?.(p.percent));
  return {
    async latest() {
      const result = await updater.checkForUpdates();
      return result?.isUpdateAvailable ? result.updateInfo.version : null;
    },
    blocked: () => null,
    async download(_version, progress) {
      onProgress = progress;
      try {
        await updater.downloadUpdate();
      } finally {
        onProgress = null;
      }
    },
    install(relaunch) {
      if (relaunch) updater.quitAndInstall(true, true);
    },
  };
}

// --- macOS: the zip, checked, swapped in after she quits ---

// Waits for her to quit (a minute at most, then leaves everything as it is), moves the new app next to
// the old one, swaps them with two renames, and opens her again if asked. A leftover from a swap cut short
// is cleared first.
const SWAP = `
pid="$1"; target="$2"; staged="$3"; relaunch="$4"
i=0
while kill -0 "$pid" 2>/dev/null; do
  i=$((i + 1)); [ "$i" -gt 300 ] && exit 1
  sleep 0.2
done
dir=$(dirname "$target"); name=$(basename "$target")
next="$dir/.$name.next"; old="$dir/.$name.old"
rm -rf "$next" "$old"
if mv "$staged" "$next" && mv "$target" "$old"; then
  if mv "$next" "$target"; then rm -rf "$old"; else mv "$old" "$target"; fi
fi
rm -rf "$next"
rmdir "$(dirname "$staged")" 2>/dev/null
xattr -dr com.apple.quarantine "$target" 2>/dev/null
[ "$relaunch" = 1 ] && open "$target"
exit 0
`;

const plist = async (bundle: string, key: string) =>
  (await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', path.join(bundle, 'Contents', 'Info.plist')])).stdout.trim();

function macBackend(src: Source): Backend {
  // the running app: …/Capri.app/Contents/MacOS/Capri
  const bundle = path.resolve(process.execPath, '..', '..', '..');
  const stage = path.join(app.getPath('userData'), 'update');
  let feed: Feed = null;
  let staged: { version: string; app: string } = null;

  return {
    async latest() {
      const res = await net.fetch(src.manifest('latest-mac.yml'), { cache: 'no-store' });
      if (res.status === 404) return null; // nothing published yet
      if (!res.ok) throw new Error(`update feed: HTTP ${res.status}`);
      feed = parseFeed(await res.text());
      return isNewer(feed.version, app.getVersion()) ? feed.version : null;
    },
    blocked() {
      if (!bundle.endsWith('.app')) return 'not an app bundle';
      // run from Downloads or a disk image, macOS runs a read-only copy somewhere else (App Translocation)
      if (bundle.includes('/AppTranslocation/')) return 'translocated';
      try {
        fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
        fs.accessSync(bundle, fs.constants.W_OK);
        return null;
      } catch {
        return 'read-only';
      }
    },
    async download(version, progress) {
      if (staged?.version === version && fs.existsSync(staged.app)) return;
      const file = feed?.version === version && pickMacZip(feed.files, process.arch);
      if (!file) throw new Error(`no ${process.arch} build of ${version} in the feed`);
      fs.rmSync(stage, { recursive: true, force: true });
      fs.mkdirSync(stage, { recursive: true });
      const zip = path.join(stage, 'update.zip');

      const res = await net.fetch(src.file(version, file.url));
      if (!res.ok || !res.body) throw new Error(`download: HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || file.size || 0;
      const hash = crypto.createHash('sha512');
      const out = fs.createWriteStream(zip);
      let got = 0;
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          hash.update(chunk);
          got += chunk.length;
          if (!out.write(chunk)) await once(out, 'drain');
          if (total) progress((100 * got) / total);
        }
      } finally {
        out.end();
        await once(out, 'close');
      }
      if (hash.digest('base64') !== file.sha512) throw new Error('the download is corrupted (sha512 mismatch)');

      await run('/usr/bin/ditto', ['-x', '-k', zip, stage]);
      fs.rmSync(zip, { force: true });
      const name = fs.readdirSync(stage).find((n) => n.endsWith('.app'));
      if (!name) throw new Error('no app in the update');
      const next = path.join(stage, name);
      if ((await plist(next, 'CFBundleIdentifier')) !== (await plist(bundle, 'CFBundleIdentifier'))) throw new Error('the update is another app');
      if ((await plist(next, 'CFBundleShortVersionString')) !== version) throw new Error('the update is another version');
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', next]);
      staged = { version, app: next };
    },
    install(relaunch) {
      if (!staged) return;
      spawn('/bin/sh', ['-c', SWAP, 'capri-update', String(process.pid), bundle, staged.app, relaunch ? '1' : '0'], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      staged = null;
    },
  };
}

// --- the schedule and what she shows of it ---

function createUpdater({ auto, onChange }: { auto: () => boolean; onChange: (state: UpdateState, manual: boolean) => void }) {
  const src = source();
  const backend: Backend = 'off' in src ? null : WIN ? windowsBackend(src) : macBackend(src);
  let state: UpdateState = 'off' in src ? { status: 'off', reason: src.off } : { status: 'idle' };
  let busy = false;
  let installing = false;
  let timers = [];

  const set = (next: UpdateState, manual = false) => {
    const same = JSON.stringify(next) === JSON.stringify(state);
    state = next;
    if (!same || manual) onChange(state, manual);
  };

  async function check(manual = false) {
    if (!backend || busy || installing) return;
    if (state.status === 'ready') return manual && set(state, true);
    busy = true;
    set({ status: 'checking' });
    try {
      const version = await backend.latest();
      if (!version) return set({ status: 'latest', version: app.getVersion() }, manual);
      if (backend.blocked()) return set({ status: 'manual', version, page: (src as Source).page }, true);
      let shown = -1;
      set({ status: 'downloading', version, percent: 0 });
      await backend.download(version, (p) => {
        const percent = Math.min(99, Math.floor(p));
        if (percent !== shown) set({ status: 'downloading', version, percent: (shown = percent) });
      });
      set({ status: 'ready', version }, true);
    } catch (err) {
      console.error('[capri] update:', err?.message || err);
      set({ status: 'error', error: String(err?.message || err).split('\n')[0].slice(0, 160) }, manual);
    } finally {
      busy = false;
    }
  }

  // the schedule, with "Update automatically" on (turned on again: a look right away)
  function schedule(soon = FIRST_CHECK) {
    timers.forEach(clearTimeout);
    timers = [];
    if (!backend || !auto()) return;
    timers.push(setTimeout(() => check(), soon));
    timers.push(setInterval(() => check(), EVERY));
  }

  // "Restart to update"
  function install() {
    if (state.status !== 'ready' || installing) return;
    installing = true;
    backend.install(true);
    if (MAC) app.quit(); // Windows: quitAndInstall quits by itself
  }

  // she's quitting with an update downloaded: put in once she's gone, without opening her again
  function onQuit() {
    timers.forEach(clearTimeout);
    if (state.status === 'ready' && !installing) {
      installing = true;
      backend.install(false);
    }
  }

  return { state: () => state, check: () => check(true), schedule, install, onQuit };
}

export { createUpdater };
export type { UpdateState };
