// Writes a public test vector for the web tests: a made-up key (seed bytes all 7), one note encrypted to it, and a made-up transaction around it.
// The key holds nothing and exists only in tests.
use orchard::{
    keys::{FullViewingKey, Scope, SpendingKey},
    note::{ExtractedNoteCommitment, Note, NoteVersion, RandomSeed, Rho},
    note_encryption::{IronwoodDomain, IronwoodNoteEncryption, OrchardDomain, OrchardNoteEncryption},
    value::NoteValue,
};
use zcash_address::unified::{self, Encoding, Fvk, Uitem};
use zcash_note_encryption::Domain;
use zcash_protocol::consensus::NetworkType;

fn key(seed: u8) -> (FullViewingKey, String) {
    let fvk = FullViewingKey::from(&SpendingKey::from_bytes([seed; 32]).unwrap());
    let ufvk = unified::Ufvk::try_from_items(unified::Revision::R0, vec![Uitem::Data(Fvk::Orchard(fvk.to_bytes()))]).unwrap();
    (fvk, ufvk.encode(&NetworkType::Test))
}

/// Returns (compact action, a made-up raw transaction that contains the full action).
fn action(fvk: &FullViewingKey, ironwood: bool, zatoshis: u64, memo_text: &str) -> (Vec<u8>, Vec<u8>) {
    let nf = { let mut b = [0u8; 32]; b[0] = 9; b };
    let rho = Rho::from_bytes(&nf).unwrap();
    let version = if ironwood { NoteVersion::V3 } else { NoteVersion::V2 };
    let note = (0u8..=255).find_map(|i| { let rseed = Option::<RandomSeed>::from(RandomSeed::from_bytes([i; 32], &rho))?;
        Option::<Note>::from(Note::from_parts(fvk.address_at(0u32, Scope::External), NoteValue::from_raw(zatoshis), rho, rseed, version)) }).unwrap();
    let mut memo = [0u8; 512]; memo[..memo_text.len()].copy_from_slice(memo_text.as_bytes());
    let cmx = ExtractedNoteCommitment::from(note.commitment()).to_bytes();
    let (epk, enc): ([u8; 32], Vec<u8>) = if ironwood { let e = IronwoodNoteEncryption::new(None, note, memo); (IronwoodDomain::epk_bytes(e.epk()).0, e.encrypt_note_plaintext().as_ref().to_vec()) }
        else { let e = OrchardNoteEncryption::new(None, note, memo); (OrchardDomain::epk_bytes(e.epk()).0, e.encrypt_note_plaintext().as_ref().to_vec()) };
    let compact = [&nf[..], &cmx, &epk, &enc[..52]].concat();
    let raw = [&[0xAAu8; 77][..], &[1u8; 32], &nf, &[2u8; 32], &cmx, &epk, &enc, &[3u8; 80], &[0xBB; 40]].concat();
    (compact, raw)
}

fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }
fn main() {
    let (fvk, mine) = key(7);
    let (_, other) = key(8);
    let text = "Dinner, Friday · Ana · $45.46 · 11 Oct 2026 · Ztab";
    let mut out = vec![format!("\"comment\": \"Test vector only. The key is made from seed bytes that are all 7 and holds nothing.\""), format!("\"key\": \"{mine}\""), format!("\"otherKey\": \"{other}\""), format!("\"memo\": \"{text}\""), "\"zatoshis\": \"3679169\"".to_string()];
    for (name, ironwood) in [("orchard", false), ("ironwood", true)] {
        let (compact, raw) = action(&fvk, ironwood, 3_679_169, text);
        let (decoy, _) = action(&key(9).0, ironwood, 5, "x");
        out.push(format!("\"{name}\": {{ \"action\": \"{}\", \"decoy\": \"{}\", \"transaction\": \"{}\" }}", hex(&compact), hex(&decoy), hex(&raw)));
    }
    println!("{{\n  {}\n}}", out.join(",\n  "));
}
