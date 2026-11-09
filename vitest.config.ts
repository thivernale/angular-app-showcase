import { defineConfig } from 'vitest/config';

// Merged into the Angular unit-test builder's config via `runnerConfig` in angular.json.
export default defineConfig({
  test: {
    // Node 25+ defines a native `globalThis.localStorage` that is `undefined` without
    // `--localstorage-file` and shadows jsdom's implementation. Disabling it in the test
    // workers fixes every invocation path (npm scripts, IDE gutter runs, direct `ng test`).
    execArgv: ['--no-experimental-webstorage'],
    browser: {
      api: {
        // Vitest's default browser-server port (63315) lies in Windows' dynamic port range
        // (49152-65535), from which Hyper-V/WinNAT reserves blocks that change across
        // reboots; when 63315 is reserved, listen fails with EACCES and the browser test
        // run (and the pre-commit hook) aborts. Ports below 49152 are never reserved that way.
        port: 41315,
      },
    },
  },
});
