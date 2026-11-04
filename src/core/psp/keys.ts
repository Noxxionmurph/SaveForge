// The PSP's fixed AES keys that savedata encryption uses: KIRK's key slots (by key seed) and the savedata hash keys.
// Hardware constants, as published by the PSP homebrew community (kirk-engine; jpcsp's CryptoEngine).

/** KIRK commands 4 and 7 (AES-128-CBC, zero IV) pick their key by seed. */
export const KIRK_KEYS: Readonly<Record<number, string>> = {
  0x03: '9802c4e6ec9e9e2ffc634ce42fbb4668',
  0x04: '99244cd258f51bcbb0619ca73830075f',
  0x05: '0225d7ba63ecb94a9d237601b3f6ac17',
  0x0c: '8485c848750843bc9b9aeca79c7f6018',
  0x0d: 'b5b16ede23a97b0ea17cdba2dcdec46e',
  0x0e: 'c871fdb3bcc5d2f2e2d7729ddf826882',
  0x10: '32295bd5eaf7a34216c88e48ff50d371',
  0x11: '46f25e8e4d2aa540730bc46e47ee6f0a',
  0x12: '5dc71139d01938bc027fdddcb0837d9d',
  0x53: 'affe8eb13dd17ed80a61241c959256b6',
  0x57: '1c9bc490e3066481fa59fdb600bb2870',
  0x64: '03b302e85ff381b13b8daa2a90ff5e61',
};

/** Savedata hash keys 1-7. */
export const SD_HASH_KEYS: readonly string[] = [
  '40e6533f05113a4ea14bdad6727c534c',
  'faaa50ec2fde5493ad14b2cea53005df',
  '36a53eacc5269ea383d9ec256c484872',
  'd8c0b0f33e6b7685fdfb4d7d451e9203',
  'cb15f407f96a523c04b9b2ee5c53fa86',
  '7044a3aeef5da5f2857ff2d694f5363b',
  'ec6d29592635a57f972a0dbca3263300',
];
