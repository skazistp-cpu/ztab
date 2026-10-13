# Splitting a bill by item

After **Start a tab**, choose **Split by item** on the Bill step. Add the people on the People step, then on the Items step enter each item's full line price and select who shared it. A fixed sum for one person is an item for them alone (any name, such as “Dan’s share”); it adds to the items total and takes its part of any tip. **Everyone** selects the people currently listed; people added later are not silently included. The summary shows the items total, tip and each person's total before links are made. The original **Split the total** mode remains available.

Tip or service is optional (0–100%, up to two decimal places) and is added to the item subtotal. Leave it at zero when service is already included in the prices. All six supported currencies use two decimal places. A bill supports up to 100 items and 49 other people.

Item prices must be positive. An unassigned item or an assignment to a removed person prevents link creation. Removed people remain visible as an assignment to clear; another person never inherits their items. Duplicate names are distinguished by their row number in the assignment controls. Someone with no share gets no payment link, including when the organiser had no items themselves.

## Rounding

Item allocation uses integer cents, not floating-point arithmetic. Each item is divided equally among its selected people. Leftover cents go in the order people appear on the People step. This is deterministic and can favour earlier rows when many items have a remainder; the rule is shown in the app.

The total tip is rounded to the nearest cent, half up. It is apportioned in proportion to each person's item subtotal. Largest fractional remainders receive leftover tip cents; participant order breaks ties. Every participant total sums exactly to the bill including tip.

Example: Ana has steak at 32; Ben has salad at 11; wine at 28 is shared by both. Their item subtotals are 46 and 25. A 10% tip adds 4.60 and 2.50, giving **50.60 + 27.50 = 78.10**.

The guided steps pass the resulting fixed amounts to the existing request engine. It omits zero shares before calling the engine. The engine, ZIP-321 serializer and share-link format are unchanged. The memo contains the existing purpose, person's name, fiat share, creation date and Ztab; it does not contain their item list.

## Edits, storage and privacy

Editing a bill clears generated sharing controls and asks the organiser to make links again. Links already copied or sent remain immutable; Ztab cannot revoke them. The item list and assignments stay in memory while the tab is made and are lost on reload. Remember stores only the organiser's address and names, as before. The pay page does not access storage. No new network service or dependency is used.

## Verification

From `apps/web`, run `npm test`, `npm run typecheck`, `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 8764`.

With an existing Playwright installation:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs TAB_BASE_URL=http://127.0.0.1:8764 node test/browser/items.mjs
```

The browser regression covers the uneven dinner, proportional tip, a zero share, stale results after edits, deliberate recovery from a removed-person assignment, duplicate names, the original mode, responsive widths, visible validation focus, and the generated request's amount and memo. It uses Chromium and Playwright WebKit; these are not real-phone wallet tests.
