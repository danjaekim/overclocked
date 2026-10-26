// Export / import of the whole save as one copy-pasteable text code (M17). No server: the code is
// the save, compressed when the browser can (CompressionStream), base64url encoded, with a checksum so
// a truncated or edited paste is rejected instead of half-applied.
//
//   OFZ1.<checksum>.<payload>   deflate-raw compressed JSON
//   OF1.<checksum>.<payload>    plain JSON (browsers without CompressionStream)
//
// Importing replaces the save (docs/architecture.md §8); the caller shows describeSave() first.

import { normalize } from './save.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function toB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export async function encodeSave(data) {
  let bytes = enc.encode(JSON.stringify(data));
  let tag = 'OF1';
  if (canCompress()) {
    try {
      bytes = await pipe(bytes, new CompressionStream('deflate-raw'));
      tag = 'OFZ1';
    } catch { /* fall back to plain */ }
  }
  const payload = toB64(bytes);
  return `${tag}.${fnv1a(payload)}.${payload}`;
}

// Returns a normalized save, or throws an Error whose message is fit to show the player.
export async function decodeSave(code) {
  const text = String(code || '').replace(/\s+/g, '');
  const m = /^(OFZ1|OF1)\.([0-9a-f]{8})\.([A-Za-z0-9_-]+)$/.exec(text);
  if (!m) throw new Error('That does not look like an Overforged code.');
  const [, tag, sum, payload] = m;
  if (fnv1a(payload) !== sum) throw new Error('The code is damaged or cut short. Copy it again in full.');
  let json;
  try {
    let bytes = fromB64(payload);
    if (tag === 'OFZ1') {
      if (!canCompress()) throw new Error('This browser cannot read compressed codes.');
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    }
    json = dec.decode(bytes);
  } catch (e) {
    throw new Error(e && /compressed/.test(e.message) ? e.message : 'The code could not be read.');
  }
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('The code could not be read.');
  }
  if (!raw || typeof raw !== 'object' || !Number.isFinite(raw.version)) throw new Error('That is not an Overforged save.');
  return normalize(raw);
}

// What a save holds, for the "replace your progress with this?" confirmation.
export function describeSave(data) {
  return {
    runs: data.runs,
    wins: data.wins,
    unlocked: data.unlocked.length,
    history: data.history.length,
    bests: data.bests,
  };
}
