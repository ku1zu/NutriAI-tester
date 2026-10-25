# NutriAI — cleaned frontend recovered from HAR

This folder contains the production frontend assets recovered from the supplied HAR, with the SiteGround/Coderick preview wrapper removed.

## Backend
The original builder backend URL was removed from the frontend bundle. `public/config.js` can set `window.__NUTRIAI_API_BASE_URL__` to your own API/PocketBase-compatible backend. Leave it empty to use the current site origin (useful when your backend is served under `/api`).

## Important
This is the compiled production frontend, not the original TypeScript source project. The original source maps/source files were not present in the HAR.

The contact page was changed to POST JSON to `/api/contact` on your configured backend instead of loading the builder's `/sgcaptcha/*` service.

A checkout-success lazy chunk was referenced by the app but was not present in the HAR; that route may need to be recreated.

## Deploy
Upload the contents of this folder to a static host. `index.html` is the entry point and `public/` should be the public web root when using a build system. For a direct static host, copy `public/*` to the site root and keep `index.html` at the root.
