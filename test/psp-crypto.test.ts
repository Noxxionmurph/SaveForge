import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cbcDecrypt, cbcEncrypt } from '../src/core/psp/aes.ts';
import { decryptSavedata, encryptSavedata, savedataHash } from '../src/core/psp/savedata.ts';

const hex = (s: string) => Uint8Array.from(s.match(/../g)!, (b) => parseInt(b, 16));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

test('AES-128 matches the FIPS-197 example', () => {
  const key = hex('000102030405060708090a0b0c0d0e0f');
  const block = hex('00112233445566778899aabbccddeeff');
  cbcEncrypt(key, block);
  assert.equal(toHex(block), '69c4e0d86a7b0430d8cdb78070b4c55a');
  cbcDecrypt(key, block);
  assert.equal(toHex(block), '00112233445566778899aabbccddeeff');
});

test('savedata: encrypt then decrypt gives the data back, with and without a game key', () => {
  const plain = new Uint8Array(0x1234 + 7).map((_, i) => (i * 37 + 11) & 0xff);
  const header = hex('00112233445566778899aabbccddeeff');
  for (const key of [hex('437beaa762302fb7c8762c17cff01460'), null]) {
    const { file, hash } = encryptSavedata(plain, key, header);
    assert.equal(file.length, plain.length + 16);
    assert.notDeepEqual(file.subarray(16, 48), plain.subarray(0, 32));
    assert.deepEqual(decryptSavedata(file, key), plain);
    assert.equal(hash.length, 16);
    // Same input, same header: same file and hash (the PSP only needs them to match each other).
    assert.deepEqual(encryptSavedata(plain, key, header).hash, hash);
  }
});

test('savedata hashes differ by mode and by content', () => {
  const d = new Uint8Array(0x500).fill(3);
  const a = savedataHash(d, 1), b = savedataHash(d, 5);
  assert.notDeepEqual(a, b);
  d[0x4ff] = 4;
  assert.notDeepEqual(savedataHash(d, 1), a);
});
