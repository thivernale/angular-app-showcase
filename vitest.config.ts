import { defineConfig } from 'vitest/config';

// Merged into the Angular unit-test builder's config via `runnerConfig` in angular.json.
export default defineConfig({
  test: {
    // Node 25+ defines a native `globalThis.localStorage` that is `undefined` without
    // `--localstorage-file` and shadows jsdom's implementation. Disabling it in the test
    // workers fixes every invocation path (npm scripts, IDE gutter runs, direct `ng test`).
    execArgv: ['--no-experimental-webstorage'],
  },
});
