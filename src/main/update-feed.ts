// The files electron-builder writes for updates: the feed published with each release
// (latest.yml, latest-mac.yml) and the app-update.yml it puts in the app, which says where that feed
// lives. Only the parts the updater needs are read, without a YAML library. No Electron here, so the
// tests can load it with plain Node.

type FeedFile = { url: string; sha512: string; size?: number };
type Feed = { version: string; files: FeedFile[] };

function scalar(raw: string) {
  const value = raw.trim();
  return /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value;
}

// Top-level `key: value` lines (app-update.yml)
function parseFlat(text: string): Record<string, string> {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z]\w*):\s*(.*)$/.exec(line);
    if (m) out[m[1]] = scalar(m[2]);
  }
  return out;
}

// latest-mac.yml: its version, and the files listed for it
//   version: 0.6.0
//   files:
//     - url: Capri-0.6.0-arm64-mac.zip
//       sha512: base64…
//       size: 123
function parseFeed(text: string): Feed {
  let version = null;
  let inFiles = false;
  let current = null;
  const files = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([A-Za-z]\w*):\s*(.*)$/.exec(line);
    if (top) {
      inFiles = top[1] === 'files';
      current = null;
      if (top[1] === 'version') version = scalar(top[2]);
      continue;
    }
    if (!inFiles) continue;
    const item = /^\s*-\s+(\w+):\s*(.*)$/.exec(line);
    const field = item || /^\s+(\w+):\s*(.*)$/.exec(line);
    if (!field) continue;
    if (item) files.push((current = {}));
    if (current) current[field[1]] = field[1] === 'size' ? Number(scalar(field[2])) : scalar(field[2]);
  }
  if (!version) throw new Error('no version in the update feed');
  return { version, files: files.filter((f) => f.url && f.sha512) };
}

// -1, 0 or 1. "1.2.3", "v1.2.3", "1.2.3-beta.1": a release comes after its own prereleases.
function compareVersions(a: string, b: string) {
  const split = (v: string) => {
    const [core, pre = ''] = String(v).trim().replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true }) > 0 ? 1 : -1;
}

const isNewer = (latest: string, current: string) => compareVersions(latest, current) > 0;

// The zip for this Mac, out of the feed's files (Capri-0.6.0-arm64-mac.zip, Capri-0.6.0-x64-mac.zip).
// An older feed's x64 zip has no arch in its name: anything not arm64 will do for an Intel Mac.
function pickMacZip(files: FeedFile[], arch: string): FeedFile | null {
  const zips = files.filter((f) => f.url.endsWith('.zip'));
  const named = zips.find((f) => new RegExp(`[-_.]${arch}[-_.]`).test(f.url));
  if (named) return named;
  if (arch === 'x64') return zips.find((f) => !/arm64/.test(f.url)) || null;
  return zips.find((f) => /universal/.test(f.url)) || null;
}

export { parseFlat, parseFeed, compareVersions, isNewer, pickMacZip };
export type { Feed, FeedFile };
