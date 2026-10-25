# Change log

## Image path fix (compiled bundle, minimal patch)
Replaced 4 string literals; no other bytes changed.

| File | Old | New |
|---|---|---|
| assets/index-BaMRH3yL.js | /generated_893f3711.webp (hero) | /images/generated_893f3711.webp |
| assets/index-BaMRH3yL.js | /generated_51684eae.webp (barcode scan section) | /images/generated_51684eae.webp |
| assets/index-BaMRH3yL.js | /generated_b99d49bc.webp (Shop & eat out feature) | /images/generated_b99d49bc.webp |
| assets/About-BplkbNN2.js | /generated_b99d49bc.webp (About page banner) | /images/generated_b99d49bc.webp |

No files deleted. images/front_en.*.jpg are not referenced by any bundle string; left untouched.
Note: bundle filenames keep their content hashes, so a CDN/browser may serve cached copies of the old JS until purged.
