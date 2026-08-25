import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const SCHEMA_VERSION = 2;
export const SIGNATURE_BYTES = 64;
export const MAX_MANIFEST_BYTES = 16 * 1024;
export const MAX_USERSCRIPT_BYTES = 2 * 1024 * 1024;
export const OFFICIAL_DOWNLOAD_URL =
  'https://update.greasyfork.org/scripts/587557/WhatsApp%20Web%20Plus.user.js';

const VERSION_PATTERN = /^\d+(?:\.\d+)*$/;
const KEY_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const EXPECTED_FIELDS = [
  'schemaVersion',
  'keyId',
  'releaseSequence',
  'version',
  'downloadUrl',
  'sha256',
  'bytes',
];

export function parseArguments(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    if (result.has(argument)) throw new Error(`Duplicate argument: ${argument}`);
    result.set(argument, value);
    index += 1;
  }
  return result;
}

export function requiredArgument(argumentsMap, name) {
  const value = argumentsMap.get(name);
  if (!value) throw new Error(`Required argument ${name} was not provided`);
  return value;
}

export function assertPathOutsideRepository(path, repositoryRoot, description) {
  const candidate = resolve(path);
  const root = resolve(repositoryRoot);
  const relation = relative(root, candidate);
  if (relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation))) {
    throw new Error(`${description} must be outside the repository: ${candidate}`);
  }
}

export async function assertNewFile(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`Refusing to overwrite existing file: ${path}`);
}

export function publicKeyFingerprint(publicKey) {
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Public key is not Ed25519');
  const jwk = key.export({ format: 'jwk' });
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string') {
    throw new Error('Public key cannot be exported as raw Ed25519 key material');
  }
  const raw = Buffer.from(jwk.x, 'base64url');
  if (raw.length !== 32) throw new Error('Raw Ed25519 public key has an invalid length');
  return createHash('sha256').update(raw).digest('hex');
}

export function createKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  });
  return { privateKey, publicKey };
}

export async function writeNewPrivateKey(path, pem) {
  await mkdir(dirname(path), { recursive: true });
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(pem, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeNewPublicKey(path, pem) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, pem, { encoding: 'utf8', flag: 'wx' });
}

export function versionFromUserscript(payload) {
  const text = payload.toString('utf8');
  const matches = [...text.matchAll(/^\/\/\s*@version\s+([^\s]+)\s*$/gm)];
  if (matches.length !== 1 || !VERSION_PATTERN.test(matches[0][1])) {
    throw new Error('Userscript must contain exactly one numeric @version directive');
  }
  return matches[0][1];
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Manifest root must be an object');
  }
  const fields = Object.keys(manifest);
  if (fields.length !== EXPECTED_FIELDS.length || fields.some((field) => !EXPECTED_FIELDS.includes(field))) {
    throw new Error('Manifest fields do not match schema version 2');
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) throw new Error('Unsupported manifest schema');
  if (typeof manifest.keyId !== 'string' || !KEY_ID_PATTERN.test(manifest.keyId)) {
    throw new Error('Invalid manifest keyId');
  }
  if (!Number.isSafeInteger(manifest.releaseSequence) || manifest.releaseSequence <= 0) {
    throw new Error('Invalid manifest releaseSequence');
  }
  if (typeof manifest.version !== 'string' || !VERSION_PATTERN.test(manifest.version)) {
    throw new Error('Invalid manifest version');
  }
  if (manifest.downloadUrl !== OFFICIAL_DOWNLOAD_URL) throw new Error('Unexpected download URL');
  if (typeof manifest.sha256 !== 'string' || !SHA256_PATTERN.test(manifest.sha256)) {
    throw new Error('Invalid manifest SHA-256');
  }
  if (!Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.bytes > MAX_USERSCRIPT_BYTES) {
    throw new Error('Invalid manifest byte count');
  }
  return manifest;
}

export function serializeManifest(manifest) {
  validateManifest(manifest);
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export function parseManifestBytes(payload) {
  if (!Buffer.isBuffer(payload)) throw new Error('Manifest must be a byte buffer');
  if (payload.length === 0 || payload.length > MAX_MANIFEST_BYTES) throw new Error('Invalid manifest size');
  if (payload[0] === 0xef && payload[1] === 0xbb && payload[2] === 0xbf) {
    throw new Error('Manifest must not contain a UTF-8 byte-order mark');
  }
  const text = payload.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(payload)) throw new Error('Manifest is not valid UTF-8');
  if (!text.endsWith('\n') || text.endsWith('\n\n') || text.includes('\r')) {
    throw new Error('Manifest must use LF and exactly one final line feed');
  }
  const duplicatePattern = /"(schemaVersion|keyId|releaseSequence|version|downloadUrl|sha256|bytes)"\s*:/g;
  const occurrences = new Map();
  for (const match of text.matchAll(duplicatePattern)) {
    occurrences.set(match[1], (occurrences.get(match[1]) ?? 0) + 1);
  }
  if ([...occurrences.values()].some((count) => count !== 1)) throw new Error('Duplicate manifest field');
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new Error('Manifest is not valid JSON', { cause: error });
  }
  validateManifest(manifest);
  if (!serializeManifest(manifest).equals(payload)) throw new Error('Manifest is not canonically serialized');
  return manifest;
}

export function decodeSignature(text) {
  if (typeof text !== 'string' || !text.endsWith('\n') || text.endsWith('\n\n') || text.includes('\r')) {
    throw new Error('Signature file must contain canonical base64 and one final line feed');
  }
  const encoded = text.slice(0, -1);
  if (!/^[A-Za-z0-9+/]{86}==$/.test(encoded)) throw new Error('Signature is not canonical base64');
  const signature = Buffer.from(encoded, 'base64');
  if (signature.length !== SIGNATURE_BYTES || signature.toString('base64') !== encoded) {
    throw new Error('Signature must decode to exactly 64 bytes');
  }
  return signature;
}

export function signManifest(manifestBytes, privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('Private key is not Ed25519');
  return sign(null, manifestBytes, privateKey);
}

export function verifyManifest(manifestBytes, signature, publicKeyPem) {
  const publicKey = createPublicKey(publicKeyPem);
  if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('Public key is not Ed25519');
  if (signature.length !== SIGNATURE_BYTES) return false;
  return verify(null, manifestBytes, publicKey, signature);
}

export async function loadAssetIdentity(path) {
  const payload = await readFile(path);
  if (payload.length === 0 || payload.length > MAX_USERSCRIPT_BYTES) throw new Error('Invalid userscript size');
  return {
    payload,
    version: versionFromUserscript(payload),
    sha256: createHash('sha256').update(payload).digest('hex'),
    bytes: payload.length,
  };
}

export async function resolvedExistingPath(path) {
  return realpath(resolve(path));
}
