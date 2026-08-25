import assert from 'node:assert/strict';
import { createHash, createPublicKey } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  OFFICIAL_DOWNLOAD_URL,
  createKeyPair,
  decodeSignature,
  parseManifestBytes,
  publicKeyFingerprint,
  serializeManifest,
  signManifest,
  verifyManifest,
  writeNewPrivateKey,
  writeNewPublicKey,
} from './scripts/update-manifest-lib.mjs';

const manifest = {
  schemaVersion: 2,
  keyId: 'test-ed25519-2026-01',
  releaseSequence: 2026082001,
  version: '2.6.76',
  downloadUrl: OFFICIAL_DOWNLOAD_URL,
  sha256: 'a'.repeat(64),
  bytes: 314284,
};
const { privateKey, publicKey } = createKeyPair();
const publicJwk = createPublicKey(publicKey).export({ format: 'jwk' });
const rawPublicKey = Buffer.from(publicJwk.x, 'base64url');
assert.equal(publicKeyFingerprint(publicKey), createHash('sha256').update(rawPublicKey).digest('hex'));
const bytes = serializeManifest(manifest);
const signature = signManifest(bytes, privateKey);
assert.equal(signature.length, 64);
assert.equal(verifyManifest(bytes, signature, publicKey), true);
assert.deepEqual(parseManifestBytes(bytes), manifest);
assert.equal(decodeSignature(`${signature.toString('base64')}\n`).equals(signature), true);

const changed = Buffer.from(bytes);
changed[changed.indexOf(Buffer.from('2.6.76'))] ^= 1;
assert.equal(verifyManifest(changed, signature, publicKey), false);
assert.throws(() => parseManifestBytes(Buffer.from(bytes.toString().replace('"bytes"', '"version"'))));
assert.throws(() => parseManifestBytes(Buffer.concat([bytes, Buffer.from('\n')])));
assert.throws(() => decodeSignature(`${signature.toString('base64')}\r\n`));
assert.throws(() => decodeSignature(`${signature.subarray(0, 63).toString('base64')}\n`));

const directory = await mkdtemp(join(tmpdir(), 'wwp-ed25519-'));
try {
  const privatePath = join(directory, 'private.pem');
  const publicPath = join(directory, 'public.pem');
  await writeNewPrivateKey(privatePath, privateKey);
  await writeNewPublicKey(publicPath, publicKey);
  assert.match(await readFile(privatePath, 'utf8'), /BEGIN PRIVATE KEY/);
  assert.match(await readFile(publicPath, 'utf8'), /BEGIN PUBLIC KEY/);
  await assert.rejects(writeNewPrivateKey(privatePath, privateKey));
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('Signed update manifest tests passed.');
