import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertNewFile,
  assertPathOutsideRepository,
  createKeyPair,
  parseArguments,
  publicKeyFingerprint,
  requiredArgument,
  writeNewPrivateKey,
  writeNewPublicKey,
} from './update-manifest-lib.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argumentsMap = parseArguments(process.argv.slice(2));
const privateKeyPath = resolve(requiredArgument(argumentsMap, '--private-key'));
const publicKeyPath = resolve(requiredArgument(argumentsMap, '--public-key'));
const keyId = requiredArgument(argumentsMap, '--key-id');

assertPathOutsideRepository(privateKeyPath, repositoryRoot, 'Private key');
if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(keyId) || keyId.startsWith('test-')) {
  throw new Error('Production key ID is invalid');
}
await Promise.all([assertNewFile(privateKeyPath), assertNewFile(publicKeyPath)]);
const { privateKey, publicKey } = createKeyPair();
await writeNewPrivateKey(privateKeyPath, privateKey);
try {
  await writeNewPublicKey(publicKeyPath, publicKey);
} catch (error) {
  throw new Error(`Private key was created at ${privateKeyPath}, but public-key creation failed`, {
    cause: error,
  });
}

console.log(`keyId=${keyId}`);
console.log(`publicKeySha256=${publicKeyFingerprint(publicKey)}`);
console.log(`privateKey=${privateKeyPath}`);
console.log(`publicKey=${publicKeyPath}`);
