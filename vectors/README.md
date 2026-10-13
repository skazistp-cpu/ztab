# Vectors

The engine is tested against the **ZecDev ZIP-321 conformance corpus**:
[`zecdev/zcash-zip321-test-vectors`](https://github.com/zecdev/zcash-zip321-test-vectors),
MIT, Copyright (c) 2026 ZecDev, pinned at commit
`f76de74ac483b9c75dbbfa1ffc40ca170a0892be`. The corpus is not copied here.
Check it out next to this repository and run:

    ZIP321_CORPUS="$(cd ../zcash-zip321-test-vectors && pwd)" npm test --prefix packages/engine

`ZIP321_CORPUS` must be an absolute path: npm runs the tests from
`packages/engine`, so a relative path would resolve from there.

Without `ZIP321_CORPUS` the corpus test is skipped and says so.

`lenient-amounts.json` holds amounts that a lenient parser reads as a number
and that the corpus does not cover. They use the corpus's invalid-vector
shape. They are ours and have not been offered upstream.
