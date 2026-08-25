import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OFFICIAL_DOWNLOAD_URL,
  assertPathOutsideRepository,
  decodeSignature,
  loadAssetIdentity,
  parseArguments,
  parseManifestBytes,
  publicKeyFingerprint,
  requiredArgument,
  serializeManifest,
  signManifest,
  verifyManifest,
} from './update-manifest-lib.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argumentsMap = parseArguments(process.argv.slice(2));
const assetPath = resolve(requiredArgument(argumentsMap, '--asset'));
const privateKeyPath = resolve(requiredArgument(argumentsMap, '--private-key'));
const publicKeyPath = resolve(requiredArgument(argumentsMap, '--public-key'));
const manifestPath = resolve(requiredArgument(argumentsMap, '--manifest-out'));
const signaturePath = resolve(requiredArgument(argumentsMap, '--signature-out'));
const keyId = requiredArgument(argumentsMap, '--key-id');
const releaseSequence = Number(requiredArgument(argumentsMap, '--release-sequence'));

assertPathOutsideRepository(privateKeyPath, repositoryRoot, 'Private key');
const packageMetadata = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'));
const metadata = await readFile(resolve(repositoryRoot, 'src/metadata.txt'), 'utf8');
const metadataVersion = metadata.match(/^\/\/\s*@version\s+([^\s]+)\s*$/m)?.[1];
const asset = await loadAssetIdentity(assetPath);
if (!metadataVersion || metadataVersion !== packageMetadata.version || asset.version !== packageMetadata.version) {
  throw new Error('package.json, src/metadata.txt, and userscript versions must match');
}

const [privateKey, publicKey] = await Promise.all([
  readFile(privateKeyPath, 'utf8'),
  readFile(publicKeyPath, 'utf8'),
]);
const manifest = {
  schemaVersion: 2,
  keyId,
  releaseSequence,
  version: asset.version,
  downloadUrl: OFFICIAL_DOWNLOAD_URL,
  sha256: asset.sha256,
  bytes: asset.bytes,
};
const manifestBytes = serializeManifest(manifest);
const signature = signManifest(manifestBytes, privateKey);
if (!verifyManifest(manifestBytes, signature, publicKey)) throw new Error('New signature failed self-verification');
const signatureBytes = Buffer.from(`${signature.toString('base64')}\n`, 'ascii');
await writeFile(manifestPath, manifestBytes, { flag: 'wx' });
try {
  await writeFile(signaturePath, signatureBytes, { flag: 'wx' });
} catch (error) {
  throw new Error(`Manifest was written at ${manifestPath}, but signature creation failed`, { cause: error });
}

const writtenManifest = await readFile(manifestPath);
const writtenSignature = decodeSignature(await readFile(signaturePath, 'ascii'));
parseManifestBytes(writtenManifest);
if (!verifyManifest(writtenManifest, writtenSignature, publicKey)) {
  throw new Error('Written release failed verification');
}
console.log(`version=${manifest.version}`);
console.log(`releaseSequence=${manifest.releaseSequence}`);
console.log(`keyId=${manifest.keyId}`);
console.log(`sha256=${manifest.sha256}`);
console.log(`bytes=${manifest.bytes}`);
console.log(`publicKeySha256=${publicKeyFingerprint(publicKey)}`);
console.log(`manifest=${manifestPath}`);
console.log(`signature=${signaturePath}`);
