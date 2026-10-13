# ztab-scan

The part of Ztab's "Check payments with a viewing key" that touches the key. It only decrypts: it holds no spending key and cannot sign or send.

- `scan_compact`: which of a list of compact actions belong to a unified viewing key, and their amounts.
- `read_note`: the whole note (amount and memo) of one of those, from the raw transaction.
- Both shielded pools with Orchard-shaped actions are read: Orchard, and the NU7 pool the libraries call Ironwood. Sapling is not.
- Only the receiving (external) side of the key is used.

`apps/web/src/find/ztab_scan.wasm` is this crate built for the browser. It has **no imports**, so it cannot reach the network, storage or a clock; the page hands it bytes and gets JSON back.

## Build and test

Rust 1.96 with the `wasm32-unknown-unknown` target. The dependencies are pinned to public revisions in `Cargo.toml` and `Cargo.lock`.

```
cargo test --release
cargo build --release --lib --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/ztab_scan.wasm ../../apps/web/src/find/ztab_scan.wasm
cargo run --release --example vector > ../../apps/web/test/fixtures/finder-vector.json
```

The build embeds local paths, so the file's hash differs between machines; the web tests (`test/find-wire.test.ts`) run the committed file against the test vector and check that it has no imports.

## Limits

- The full note is found in the raw transaction by its commitment and ephemeral key, which are followed by the ciphertext, and not by parsing the transaction. A wrong position cannot yield a note, because decryption is authenticated; it could miss one in a transaction format that orders these fields differently.
- The test vector's key is made from seed bytes that are all 7. It holds nothing and must never be used.
