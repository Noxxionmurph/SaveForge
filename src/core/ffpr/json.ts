// JSON that writes back exactly as it was read. Pixel Remaster saves are JSON whose inner objects are themselves
// stored as JSON strings, several levels deep, and the game's loader is picky (a save that differs in form can hang it
// at start-up), so: numbers keep their original text (no float re-rounding, no precision loss on big integers), key
// order is kept, and a nested string is only re-encoded when something inside it changed.

/** A number kept as the text the file had, so it writes back unchanged. */
export class Num {
  text: string;
  constructor(text: string) { this.text = text; }
  get value(): number { return Number(this.text); }
}

export type Json = null | boolean | string | Num | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** Parse JSON text, keeping numbers as `Num`. Throws on bad input. */
export function parse(text: string): Json {
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
  const fail = (): never => { throw new Error(`bad JSON at ${i}`); };
  const value = (): Json => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const o: JsonObject = {};
      ws();
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail();
        const k = str();
        ws();
        if (text[i++] !== ':') fail();
        o[k] = value();
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i++] !== '}') fail();
        return o;
      }
    }
    if (c === '[') {
      i++;
      const a: Json[] = [];
      ws();
      if (text[i] === ']') { i++; return a; }
      for (;;) {
        a.push(value());
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i++] !== ']') fail();
        return a;
      }
    }
    if (c === '"') return str();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 40));
    if (!m) fail();
    i += m![0].length;
    return new Num(m![0]);
  };
  const str = (): string => {
    // Find the closing quote, then let the built-in parser do the unescaping.
    const start = i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    if (i >= text.length) fail();
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const v = value();
  ws();
  if (i !== text.length) fail();
  return v;
}

/** Write JSON with no spaces, as the game does: non-ASCII letters as themselves, only quotes, backslashes and control characters escaped. */
export function stringify(v: Json): string {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  if (v instanceof Num) return v.text;
  if (Array.isArray(v)) return `[${v.map(stringify).join(',')}]`;
  return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}:${stringify(x)}`).join(',')}}`;
}

/**
 * A save as a tree of JSON documents: the top object, and every object stored as a string inside another (the save's
 * "userData", the character list, each character, ...). `open` reads one such string on first use; `touch` marks it
 * changed; `text` writes the changed ones back into their parents, innermost first, so documents nobody touched keep
 * the exact text the game wrote.
 */
export class Doc {
  readonly root: JsonObject;
  private nodes = new Map<Json[] | JsonObject, Map<string | number, Packed>>();
  private all: Packed[] = [];
  constructor(text: string) {
    const root = parse(text);
    if (!root || typeof root !== 'object' || Array.isArray(root) || root instanceof Num) throw new Error('not a JSON object');
    this.root = root;
  }
  /** The document stored as a string at `owner[key]`, parsed. `parent` is the document `owner` lives in (none for the top). */
  open(owner: Json[] | JsonObject, key: string | number, parent?: Packed): Packed {
    let byKey = this.nodes.get(owner);
    if (!byKey) this.nodes.set(owner, byKey = new Map());
    let node = byKey.get(key);
    if (!node) {
      const raw = (owner as Record<string | number, Json>)[key];
      if (typeof raw !== 'string') throw new Error(`no packed JSON at ${String(key)}`);
      node = new Packed(owner, key, parse(raw), parent);
      byKey.set(key, node);
      this.all.push(node);
    }
    return node;
  }
  /** The whole save as JSON text, with every changed document written back. */
  text(): string {
    for (const n of [...this.all].sort((a, b) => b.depth - a.depth)) n.writeBack();
    return stringify(this.root);
  }
}

export class Packed {
  readonly value: Json;
  readonly depth: number;
  private dirty = false;
  private owner: Json[] | JsonObject;
  private key: string | number;
  private parent: Packed | undefined;
  constructor(owner: Json[] | JsonObject, key: string | number, value: Json, parent?: Packed) {
    this.owner = owner; this.key = key; this.value = value; this.parent = parent;
    this.depth = parent ? parent.depth + 1 : 0;
  }
  get obj(): JsonObject { return this.value as JsonObject; }
  /** Mark this document (and so every one around it) changed. */
  touch(): void {
    for (let n: Packed | undefined = this; n && !n.dirty; n = n.parent) n.dirty = true;
  }
  writeBack(): void {
    if (!this.dirty) return;
    (this.owner as Record<string | number, Json>)[this.key] = stringify(this.value);
    this.dirty = false;
  }
}

export const num = (n: number): Num => new Num(String(Math.trunc(n)));
export const asNum = (v: Json | undefined): number => (v instanceof Num ? v.value : 0);
