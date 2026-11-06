import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlat, parseFeed, compareVersions, isNewer, pickMacZip } from '../src/main/update-feed';

// as electron-builder writes them
const MAC_FEED = `version: 0.6.0
files:
  - url: Capri-0.6.0-arm64-mac.zip
    sha512: AAAarm==
    size: 104857600
    blockMapSize: 110000
  - url: Capri-0.6.0-x64-mac.zip
    sha512: BBBx64==
    size: 109000000
path: Capri-0.6.0-arm64-mac.zip
sha512: AAAarm==
releaseDate: '2026-11-06T10:00:00.000Z'
`;

test('latest-mac.yml: the version and every file with its sha512 and size', () => {
  const feed = parseFeed(MAC_FEED);
  assert.equal(feed.version, '0.6.0');
  assert.deepEqual(feed.files, [
    { url: 'Capri-0.6.0-arm64-mac.zip', sha512: 'AAAarm==', size: 104857600, blockMapSize: '110000' },
    { url: 'Capri-0.6.0-x64-mac.zip', sha512: 'BBBx64==', size: 109000000 },
  ]);
  // Windows line endings, quoted values
  const crlf = parseFeed("version: '1.0.0'\r\nfiles:\r\n  - url: \"a.zip\"\r\n    sha512: x\r\n");
  assert.deepEqual(crlf, { version: '1.0.0', files: [{ url: 'a.zip', sha512: 'x' }] });
  assert.throws(() => parseFeed('files: []\n'), /no version/);
});

test('app-update.yml: where the feed lives', () => {
  assert.deepEqual(parseFlat('owner: Nsttt\nrepo: capri-desktop\nprovider: github\nupdaterCacheDirName: capri-desktop-updater\n'), {
    owner: 'Nsttt', repo: 'capri-desktop', provider: 'github', updaterCacheDirName: 'capri-desktop-updater',
  });
});

test('versions: numbers compared as numbers, a release after its prereleases', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('v1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.0-beta.2'), 1);
  assert.equal(compareVersions('1.0.0-beta.10', '1.0.0-beta.2'), 1);
  assert.equal(isNewer('0.5.1', '0.5.1'), false);
  assert.equal(isNewer('0.5.0', '0.5.1'), false);
  assert.equal(isNewer('0.5.2', '0.5.1'), true);
});

test('the zip for this Mac: by arch, an older unnamed x64 zip, nothing for a missing arch', () => {
  const { files } = parseFeed(MAC_FEED);
  assert.equal(pickMacZip(files, 'arm64').url, 'Capri-0.6.0-arm64-mac.zip');
  assert.equal(pickMacZip(files, 'x64').url, 'Capri-0.6.0-x64-mac.zip');
  const old = [{ url: 'Capri-0.6.0-arm64-mac.zip', sha512: 'a' }, { url: 'Capri-0.6.0-mac.zip', sha512: 'b' }];
  assert.equal(pickMacZip(old, 'x64').url, 'Capri-0.6.0-mac.zip');
  assert.equal(pickMacZip([{ url: 'Capri-0.6.0-x64-mac.zip', sha512: 'b' }], 'arm64'), null);
  assert.equal(pickMacZip([{ url: 'Capri-0.6.0-universal-mac.zip', sha512: 'u' }], 'arm64').url, 'Capri-0.6.0-universal-mac.zip');
});
