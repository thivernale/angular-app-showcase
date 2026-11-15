import { defineConfig } from 'vitest/config';

// The backend's own config, so Vitest does not pick up the frontend's vitest.config.ts from the repository root
// (that one needs the root dependencies, which the backend does not install).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
