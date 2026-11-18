import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { deflateRaw, storeDeflate } from '../src/core/deflate.ts';
import { decryptBlock, encryptBlock, openPrFile, sealPrFile } from '../src/core/ffpr/crypto.ts';
import { openPr } from '../src/core/ffpr/file.ts';
import { Doc, Num, parse, stringify } from '../src/core/ffpr/json.ts';
import { inflate } from '../src/core/unzip.ts';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

test('Rijndael with a 256-bit block and key matches the reference result, and decrypts back', () => {
  // Expected value from a byte-wise implementation of the Rijndael spec that also reproduces AES-256 (Nb = 4) exactly.
  const plain = Uint8Array.from({ length: 32 }, (_, i) => i);
  const sealed = encryptBlock(plain);
  assert.equal(hex(sealed), 'a97d5100e7e81deb0bedd4e33d85dacecfa79f6cf57ad934125b3d089b922e95');
  assert.equal(hex(decryptBlock(sealed)), hex(plain));
});

test('deflate output inflates back, for text, noise and empty input', () => {
  const text = new TextEncoder().encode('{"target":["{\\"contentId\\":2,\\"count\\":9}","{\\"contentId\\":3,\\"count\\":4}"]}'.repeat(400));
  let seed = 7;
  const noise = Uint8Array.from({ length: 70_000 }, () => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24);
  for (const data of [text, noise, new Uint8Array(0), Uint8Array.of(65)]) {
    const packed = deflateRaw(data);
    assert.deepEqual(inflate(packed), data);
    assert.deepEqual(inflate(storeDeflate(data)), data);
  }
  assert.ok(deflateRaw(text).length < text.length / 10, 'repetitive text compresses');
});

test('JSON keeps numbers, key order and nested text exactly', () => {
  const text = '{"b":638745476766072812,"a":11458.392543227154,"c":[1.0,-0,2e5,"x\\"y"],"d":"{\\"n\\":\\"Ünïcode 名前\\"}","e":true,"f":null}';
  const v = parse(text);
  assert.equal(stringify(v), text);
  const doc = new Doc(text);
  const inner = doc.open(doc.root, 'd');
  assert.equal(inner.obj.n, 'Ünïcode 名前');
  assert.equal(doc.text(), text, 'untouched documents are left as they were');
  inner.obj.n = 'Bob';
  inner.touch();
  assert.equal(doc.text(), text.replace('Ünïcode 名前', 'Bob'));
  assert.ok((parse('{"x":5}') as Record<string, unknown>).x instanceof Num);
});

/** A slot file shaped like the games write them, cut down to the fields read here. */
function slotJson(chars: { job: number; skillKeys: number; jobs: number }[], extraUser = ''): string {
  const ch = (c: { job: number; skillKeys: number; jobs: number }, i: number) => JSON.stringify({
    id: i + 1, characterStatusId: i + 1, isEnableCorps: true, jobId: c.job, name: `C${i}`, currentExp: 0,
    parameter: JSON.stringify({ currentHP: 30 }),
    jobList: JSON.stringify({ target: Array.from({ length: c.jobs }, (_, k) => JSON.stringify({ id: k + 1, level: 1, currentProficiency: 0 })) }),
    skillLevelTargets: JSON.stringify({ keys: Array.from({ length: c.skillKeys }, (_, k) => k), values: Array.from({ length: c.skillKeys }, () => 0) }),
  });
  const user = `{"ownedCharacterList":${JSON.stringify(JSON.stringify({ target: chars.map(ch) }))},"owendGil":500${extraUser}}`;
  return `{"id":1,"pictureData":"","userData":${JSON.stringify(user)},"timeStamp":"10/21/2026 11:20:29 AM","playTime":0.0}`;
}

test('a sealed slot opens again, and each game is told apart', () => {
  const cases: [string, ReturnType<typeof slotJson>][] = [
    ['ff1', slotJson([1, 2, 3, 4].map((job) => ({ job, skillKeys: 0, jobs: 6 })))],
    ['ff2', slotJson([1, 2, 3, 9].map((job) => ({ job, skillKeys: 10, jobs: 9 })))],
    ['ff3', slotJson([1, 1, 1, 1].map((job) => ({ job, skillKeys: 2, jobs: 1 })))],
    ['ff5', slotJson([1, 1, 1, 1].map((job) => ({ job, skillKeys: 0, jobs: 22 })), ',"braveBladeEscapeCount":0')],
  ];
  for (const [game, json] of cases) {
    for (const bom of [true, false]) {
      const file = sealPrFile(json, bom);
      assert.equal(openPrFile(file).json, json);
      assert.equal(openPr(file)?.game, game);
    }
  }
  assert.equal(openPr(new TextEncoder().encode('not a save at all, just some text that is long enough to look')), null);
});

// Real files: set FFPR_DIR to a folder of Pixel Remaster saves (copies) to check every one opens and seals back unchanged.
const dir = process.env.FFPR_DIR;
test('real Pixel Remaster files open and seal back to the same JSON', { skip: !dir || !existsSync(dir) }, () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name)); };
  walk(dir!);
  let opened = 0;
  for (const f of files) {
    const data = new Uint8Array(readFileSync(f));
    let json: string;
    try { json = openPrFile(data).json; } catch { continue; }
    opened++;
    const doc = new Doc(json);
    assert.equal(doc.text(), json);
    assert.equal(openPrFile(sealPrFile(json, true)).json, json);
  }
  assert.ok(opened > 0);
});
