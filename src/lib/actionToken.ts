// ============================================================================
// ACTION TOKEN — client-side signed role proof (MASTER §2.1.4, offline-safe)
// ----------------------------------------------------------------------------
// WHY: this POS uses the PUBLIC anon key + an offline-login fallback, so the
// server cannot trust auth.uid() (it is NULL for offline users). Per-role RLS
// therefore cannot be enforced by Supabase natively without breaking offline.
//
// FIX: every sensitive RPC call carries a signature over
//   SHA256( offline_hash + '|' + user_id + '|' + role + '|' + action )
// keyed by the user's `offline_hash` (a SHA-256 of their password, known only
// to the legit user + stored server-side). The RPC recomputes the digest and
// rejects if it does not match or if the claimed role != stored role. An
// attacker without the password cannot forge another role. Works online AND
// offline (the hash is available in both states).
//
// A pure-JS SHA-256 is included so it also works on tablet LAN IPs where
// crypto.subtle (secure context only) is unavailable.
// ============================================================================

const ACTOR_KEY = 'pos_offline_profile';

export interface Actor {
  id: string;
  role: string;
  offlineHash?: string;
}

export function getActor(): Actor | null {
  try {
    const raw = localStorage.getItem(ACTOR_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { id: p.id, role: p.role, offlineHash: p.offlineHash ?? p.offline_hash };
  } catch {
    return null;
  }
}

export async function sha256Hex(message: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha256Js(message);
}

/**
 * Build the signature proof for a protected action. Returns null when no actor
 * is available (caller must then BLOCK — an unknown actor never passes a
 * privileged RPC).
 */
export async function signAction(action: string): Promise<{
  p_user_id: string;
  p_role: string;
  p_sig: string;
} | null> {
  const actor = getActor();
  if (!actor || !actor.offlineHash) return null;
  const message = `${actor.offlineHash}|${actor.id}|${actor.role}|${action}`;
  const sig = await sha256Hex(message);
  return { p_user_id: actor.id, p_role: actor.role, p_sig: sig };
}

// ── Pure-JS SHA-256 (RFC 6234) — used only when crypto.subtle is absent ──────
function sha256Js(msg: string): string {
  const m = utf8(msg);
  const l = m.length;
  const withOne = l + 1;
  const k = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + k + 8;
  const bytes = new Uint8Array(total);
  bytes.set(m);
  bytes[l] = 0x80;
  const bitLen = l * 8;
  // 64-bit length (big-endian) into last 8 bytes
  for (let i = 0; i < 8; i++) bytes[total - 1 - i] = (bitLen >>> (8 * i)) & 0xff;

  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, '0')).join('');
}

function ror(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
