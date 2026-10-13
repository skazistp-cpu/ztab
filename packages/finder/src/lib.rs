//! Ztab note finder. Decryption with a viewing key only: nothing here can spend, sign or send.
//! Built for the browser without the full transaction library.

use orchard::{
    keys::{FullViewingKey, PreparedIncomingViewingKey, Scope},
    note::{ExtractedNoteCommitment, Nullifier},
    note_encryption::{CompactAction, IronwoodDomain, OrchardDomain},
};
use zcash_address::unified::{self, Container, Encoding, Fvk};
use zcash_note_encryption::{try_compact_note_decryption, try_note_decryption, EphemeralKeyBytes, ShieldedOutput};

/// One compact action as the light-wallet server sends it: nullifier, cmx, ephemeral key, 52 bytes of ciphertext.
pub const COMPACT: usize = 148;
const ENC: usize = 580;

fn ivk(ufvk: &str) -> Result<PreparedIncomingViewingKey, String> {
    let (_, _, key) = unified::Ufvk::decode(ufvk.trim()).map_err(|e| format!("viewing key: {e}"))?;
    let raw = key.items().into_iter().find_map(|i| match i { Fvk::Orchard(b) => Some(b), _ => None }).ok_or("this viewing key has no Orchard part")?;
    let fvk = FullViewingKey::from_bytes(&raw).ok_or("the Orchard part of this viewing key is not valid")?;
    Ok(PreparedIncomingViewingKey::new(&fvk.to_ivk(Scope::External)))
}

fn compact(a: &[u8]) -> Option<CompactAction> {
    let part = |n: usize| -> [u8; 32] { a[n * 32..n * 32 + 32].try_into().unwrap() };
    let nf = Option::from(Nullifier::from_bytes(&part(0)))?;
    let cmx = Option::from(ExtractedNoteCommitment::from_bytes(&part(1)))?;
    Some(CompactAction::from_parts(nf, cmx, EphemeralKeyBytes(part(2)), a[96..COMPACT].try_into().unwrap()))
}

/// Returns (index, zatoshis) for each compact action that belongs to the key.
pub fn scan_compact(ufvk: &str, actions: &[u8], ironwood: bool) -> Result<Vec<(u32, u64)>, String> {
    let ivk = ivk(ufvk)?;
    Ok(actions.chunks_exact(COMPACT).enumerate().filter_map(|(i, a)| {
        let ca = compact(a)?;
        let v = if ironwood { try_compact_note_decryption(&IronwoodDomain::for_compact_action(&ca), &ivk, &ca)?.0.value().inner() }
            else { try_compact_note_decryption(&OrchardDomain::for_compact_action(&ca), &ivk, &ca)?.0.value().inner() };
        Some((i as u32, v))
    }).collect())
}

type EncBytes = orchard::note_encryption::NoteCiphertextBytes;
struct Full { epk: [u8; 32], cmx: ExtractedNoteCommitment, enc: EncBytes }
macro_rules! output { ($d:ty) => { impl ShieldedOutput<$d> for Full {
    fn ephemeral_key(&self) -> EphemeralKeyBytes { EphemeralKeyBytes(self.epk) }
    fn cmstar(&self) -> &ExtractedNoteCommitment { &self.cmx }
    fn enc_ciphertext(&self) -> Option<&EncBytes> { Some(&self.enc) }
    fn enc_ciphertext_compact(&self) -> orchard::note_encryption::CompactNoteCiphertextBytes { unreachable!("full outputs only") }
} } }
output!(OrchardDomain);
output!(IronwoodDomain);

pub struct Note { pub zatoshis: u64, pub memo: [u8; 512] }

/// Reads the whole note (amount and memo) for one compact action that `scan_compact` found, from the raw transaction.
/// The action is located by its commitment and ephemeral key, which are followed by the 580-byte ciphertext in every
/// transaction version that carries Orchard-shaped actions. A wrong location cannot produce a note: decryption is authenticated.
pub fn read_note(ufvk: &str, raw_tx: &[u8], action: &[u8], ironwood: bool) -> Result<Option<Note>, String> {
    use zcash_note_encryption::note_bytes::NoteBytes;
    let ivk = ivk(ufvk)?;
    if action.len() != COMPACT { return Err("one compact action is 148 bytes".into()); }
    let ca = compact(action).ok_or("not a valid action")?;
    let needle = &action[32..96];
    for at in raw_tx.windows(64).enumerate().filter_map(|(i, w)| (w == needle).then_some(i)) {
        let Some(enc) = raw_tx.get(at + 64..at + 64 + ENC).and_then(EncBytes::from_slice) else { continue };
        let out = Full { epk: action[64..96].try_into().unwrap(), cmx: Option::from(ExtractedNoteCommitment::from_bytes(action[32..64].try_into().unwrap())).ok_or("not a valid commitment")?, enc };
        let found = if ironwood { try_note_decryption(&IronwoodDomain::for_compact_action(&ca), &ivk, &out).map(|(n, _, m)| (n.value().inner(), m)) }
            else { try_note_decryption(&OrchardDomain::for_compact_action(&ca), &ivk, &out).map(|(n, _, m)| (n.value().inner(), m)) };
        if let Some((zatoshis, memo)) = found { return Ok(Some(Note { zatoshis, memo })); }
    }
    Ok(None)
}

/// The text of a memo, if it is a text memo (ZIP 302): UTF-8 with trailing zero bytes removed.
pub fn memo_text(memo: &[u8; 512]) -> Option<&str> {
    if memo[0] >= 0xF5 { return None; }
    let end = memo.iter().rposition(|b| *b != 0).map_or(0, |i| i + 1);
    core::str::from_utf8(&memo[..end]).ok()
}

// ---- WebAssembly surface: plain C ABI, results as UTF-8 JSON behind a 4-byte length ----
fn json_str(s: &str) -> String { let mut o = String::from("\""); for c in s.chars() { match c { '"' => o.push_str("\\\""), '\\' => o.push_str("\\\\"), c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)), c => o.push(c) } } o.push('"'); o }
fn give(s: String) -> *mut u8 { let mut v = (s.len() as u32).to_le_bytes().to_vec(); v.extend_from_slice(s.as_bytes()); v.shrink_to_fit(); let p = v.as_mut_ptr(); std::mem::forget(v); p }
unsafe fn bytes<'a>(p: *const u8, n: usize) -> &'a [u8] { std::slice::from_raw_parts(p, n) }
fn fail(e: String) -> String { format!("{{\"error\":{}}}", json_str(&e)) }

#[no_mangle] pub extern "C" fn ztab_alloc(n: usize) -> *mut u8 { let mut v = Vec::<u8>::with_capacity(n.max(1)); let p = v.as_mut_ptr(); std::mem::forget(v); p }
#[no_mangle] pub unsafe extern "C" fn ztab_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))) }

#[no_mangle] pub unsafe extern "C" fn ztab_scan_compact(k: *const u8, kn: usize, a: *const u8, an: usize, ironwood: u32) -> *mut u8 {
    let key = String::from_utf8_lossy(bytes(k, kn));
    give(match scan_compact(&key, bytes(a, an), ironwood != 0) {
        Ok(f) => format!("{{\"hits\":[{}]}}", f.iter().map(|(i, v)| format!("[{i},\"{v}\"]")).collect::<Vec<_>>().join(",")),
        Err(e) => fail(e),
    })
}

#[no_mangle] pub unsafe extern "C" fn ztab_read_note(k: *const u8, kn: usize, t: *const u8, tn: usize, a: *const u8, an: usize, ironwood: u32) -> *mut u8 {
    let key = String::from_utf8_lossy(bytes(k, kn));
    give(match read_note(&key, bytes(t, tn), bytes(a, an), ironwood != 0) {
        Ok(Some(n)) => format!("{{\"zatoshis\":\"{}\",\"memo\":{}}}", n.zatoshis, memo_text(&n.memo).map_or("null".into(), json_str)),
        Ok(None) => "{\"zatoshis\":null}".into(),
        Err(e) => fail(e),
    })
}
