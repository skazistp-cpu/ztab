# Table QR

After making the links, **Show Table QR** opens one code for the table. Friends scan it with a phone camera, choose their own name and amount, and see the existing pay page. That pay page keeps the original recipient warning, note, address and wallet button. The table code is a website link, not a ZIP-321 payment request to scan directly inside a wallet.

Anyone holding the table link can see the names and shares it contains. It is not private, signed or authenticated. Choosing a name does not reserve it, identify a person or record a payment. Duplicate names are numbered and prompt friends to check with the organiser. The organiser's own share is excluded; friends owing zero are listed without a payment link. Check actual payments in the wallet.

The `g1` web envelope carries common bill fields once, plus ordered name/fiat-share/zatoshi tuples and zero-share names. It does not change the engine or individual `s1`/`s2` links. Each row is reconstructed using `encodeShare`, checked by the unchanged engine and `requestFor`, then handed to the existing pay page. Every row must pass before the picker opens. The tests compare each request URI byte for byte with its original individual link, including rounding and the exact memo. A selected `/0`…`/48` suffix means a row position, never a name match. Reload and Back preserve the selected link without storage.

Limits: at most 49 friends, 20,000 fragment characters, strict UTF-8/base64url/JSON tuple shapes and existing engine field limits. Invalid or inconsistent links do not get a payment action. Well-formed alterations that satisfy the original engine remain possible, just as with individual links; the recipient warning remains essential.

QR uses error correction M and a four-module quiet zone. More than 97 data modules per side is declined on the code page, with Copy table link and the original individual links as alternatives. This prevents an arbitrarily dense code from being offered as phone-readable. Large tables still have a working name-picker link. Bill edits remove current table-sharing controls along with the individual ones; they cannot revoke links already copied.

No storage is read or written on the table picker/code/pay routes. No new font, host, runtime dependency or request was added. Native links provide navigation; the route heading receives focus, and interactive controls retain the existing visible keyboard focus treatment.

Verification: web 99 tests; engine tests 143 (137 pass, 6 skip), of which 67 are ZecDev ZIP 321 conformance tests. Production browser runs in Chromium/Playwright WebKit cover exact request equality, maker/QR/picker flows, copy, reload/Back, duplicates, markup as inert text, invalid selectors, altered amounts, zero shares and dense fallback. Screenshots at390/1280 light/dark and independent Vision decoding of those QR screenshots are evidence, **not a real-camera scan or a new wallet/payment test**.
