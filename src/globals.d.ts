/**
 * True in a single-file standalone build (`npm run build:standalone`), where
 * the whole game — code, styles and artwork — is inlined into one HTML file.
 * Such a build has no sibling files to fetch, so the service worker and the
 * baked-pack loader are compiled out behind this flag.
 */
declare const __STANDALONE__: boolean;
