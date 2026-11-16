// Writes the made-up saves the browser checks open (nothing here comes from a real game):
//   node e2e/make-fixtures.ts [folder]
//   sample.sav     the site's "Try a sample save" file: a Yellow save
//   rb.sav         the same trainer as a Red/Blue save (Yellow tells itself apart by Pikachu's friendship block)
//   rb-footer.sav  rb.sav with the 44-byte footer some emulators add (32,812 bytes)
//   gold.sav       the Crystal sample's trainer as a Gold save (the landing page only offers the Crystal one)
//   ruby.sav       a Ruby / Sapphire save, and emerald.sav the same trainer in Emerald (no Gen 3 sample on the landing page)
//   firered.sav    a FireRed / LeafGreen save (Leaf in Pallet Town)
//   ULUS10251DATA00.zip  a Final Fantasy (PSP) save folder; dawn-of-souls.sav and dawn-of-souls-2.sav Final Fantasy I and II (GBA) saves; ff2-famicom.sav Final Fantasy II (Famicom); ULUS1026300.zip Final Fantasy II (PSP); ff2-wonderswan.sav Final Fantasy II (WonderSwan Color);
//   ff1-wonderswan.sav   a Final Fantasy (WonderSwan Color) save
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildSampleSave } from '../src/core/gen1/sample.ts';
import { GEN1_OFFSETS as O, checksum8 } from '../src/core/gen1/save.ts';
import { buildSampleSave as buildGen2Sample } from '../src/core/gen2/sample.ts';
import { buildSampleSave as buildGen3Sample } from '../src/core/gen3/sample.ts';
import { buildFf1PspSample } from '../src/core/ff1psp/sample.ts';
import { buildFf1GbaSample } from '../src/core/ff1gba/sample.ts';
import { buildFf2GbaSample } from '../src/core/ff2gba/sample.ts';
import { buildFf1WscSample } from '../src/core/ff1wsc/sample.ts';
import { buildFf2NesSample } from '../src/core/ff2nes/sample.ts';
import { buildFf3NesSample } from '../src/core/ff3nes/sample.ts';
import { buildFf2PspSample } from '../src/core/ff2psp/sample.ts';
import { buildFf2WscSample } from '../src/core/ff2wsc/sample.ts';

const out = process.argv[2] ?? 'e2e/out';
mkdirSync(out, { recursive: true });

const sample = buildSampleSave();
writeFileSync(`${out}/sample.sav`, sample);

const rb = sample.slice();
rb[O.pikachuFriendship] = 0; rb[O.pikachuMood] = 0;
rb[O.checksum] = checksum8(rb, O.checksumStart, O.checksumEnd);
writeFileSync(`${out}/rb.sav`, rb);

const footer = Uint8Array.from({ length: 44 }, (_, i) => 0xa5 ^ i);
writeFileSync(`${out}/rb-footer.sav`, Buffer.concat([rb, footer]));
writeFileSync(`${out}/gold.sav`, buildGen2Sample('gs'));
writeFileSync(`${out}/ruby.sav`, buildGen3Sample('rs'));
writeFileSync(`${out}/emerald.sav`, buildGen3Sample('emerald'));
writeFileSync(`${out}/firered.sav`, buildGen3Sample('frlg'));
writeFileSync(`${out}/ULUS10251DATA00.zip`, buildFf1PspSample());
writeFileSync(`${out}/dawn-of-souls.sav`, buildFf1GbaSample());
writeFileSync(`${out}/dawn-of-souls-2.sav`, buildFf2GbaSample());
writeFileSync(`${out}/ff1-wonderswan.sav`, buildFf1WscSample());
writeFileSync(`${out}/ff2-famicom.sav`, buildFf2NesSample());
writeFileSync(`${out}/ff3-famicom.sav`, buildFf3NesSample());
writeFileSync(`${out}/ULUS1026300.zip`, buildFf2PspSample());
writeFileSync(`${out}/ff2-wonderswan.sav`, buildFf2WscSample());
console.log(`wrote sample.sav, rb.sav, rb-footer.sav, gold.sav, ruby.sav, emerald.sav, firered.sav, ULUS10251DATA00.zip, dawn-of-souls.sav, dawn-of-souls-2.sav ff1-wonderswan.sav, ff2-famicom.sav, ULUS1026300.zip and ff2-wonderswan.sav to ${out}`);
