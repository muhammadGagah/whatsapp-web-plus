import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  decodeSignature,
  loadAssetIdentity,
  parseArguments,
  parseManifestBytes,
  publicKeyFingerprint,
  requiredArgument,
  verifyManifest,
} from './update-manifest-lib.mjs';

const argumentsMap = parseArguments(process.argv.slice(2));
const manifestPath = resolve(requiredArgument(argumentsMap, '--manifest'));
const signaturePath = resolve(requiredArgument(argumentsMap, '--signature'));
const publicKeyPath = resolve(requiredArgument(argumentsMap, '--public-key'));
const assetPath = resolve(requiredArgument(argumentsMap, '--asset'));

const [manifestBytes, signatureText, publicKey, asset] = await Promise.all([
  readFile(manifestPath),
  readFile(signaturePath, 'ascii'),
  readFile(publicKeyPath, 'utf8'),
  loadAssetIdentity(assetPath),
]);
const signature = decodeSignature(signatureText);
if (!verifyManifest(manifestBytes, signature, publicKey)) throw new Error('Manifest signature is invalid');
const manifest = parseManifestBytes(manifestBytes);
if (manifest.version !== asset.version || manifest.sha256 !== asset.sha256 || manifest.bytes !== asset.bytes) {
  throw new Error('Userscript does not match the signed manifest');
}

console.log(`verified=true`);
console.log(`version=${manifest.version}`);
console.log(`releaseSequence=${manifest.releaseSequence}`);
console.log(`keyId=${manifest.keyId}`);
console.log(`sha256=${manifest.sha256}`);
console.log(`bytes=${manifest.bytes}`);
console.log(`publicKeySha256=${publicKeyFingerprint(publicKey)}`);
