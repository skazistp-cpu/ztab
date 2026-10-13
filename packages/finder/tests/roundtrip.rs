//! Offline check of the browser core: a note encrypted to a key is found and read; another key finds nothing.
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

#[test]
fn finds_and_reads_its_own_note_only() {
    let (fvk, mine) = key(7);
    let (_, other) = key(8);
    let text = "Dinner, Friday · Dragan · $50.00 · 10 Oct 2026 · Ztab";
    for ironwood in [false, true] {
        let (compact, raw) = action(&fvk, ironwood, 804_690, text);
        let (decoy, _) = action(&key(9).0, ironwood, 5, "x");
        let block = [&decoy[..], &compact, &decoy].concat();
        assert_eq!(ztab_scan::scan_compact(&mine, &block, ironwood).unwrap(), vec![(1, 804_690)]);
        assert_eq!(ztab_scan::scan_compact(&other, &block, ironwood).unwrap(), vec![]);
        // The wrong pool's rules must not read the note.
        assert_eq!(ztab_scan::scan_compact(&mine, &block, !ironwood).unwrap(), vec![]);
        let note = ztab_scan::read_note(&mine, &raw, &compact, ironwood).unwrap().expect("note");
        assert_eq!(note.zatoshis, 804_690);
        assert_eq!(ztab_scan::memo_text(&note.memo), Some(text));
        assert!(ztab_scan::read_note(&other, &raw, &compact, ironwood).unwrap().is_none());
        // A transaction that does not hold the action gives nothing.
        assert!(ztab_scan::read_note(&mine, &raw[..300], &compact, ironwood).unwrap().is_none());
        // One changed ciphertext byte gives nothing: decryption is authenticated.
        let mut bad = raw.clone(); bad[77 + 160 + 100] ^= 1;
        assert!(ztab_scan::read_note(&mine, &bad, &compact, ironwood).unwrap().is_none());
    }
    assert!(ztab_scan::scan_compact("not a key", &[], true).is_err());
}
