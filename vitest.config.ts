import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { e2eCommands } from './tests/e2e/commands.ts';

const pathToExtension = path.resolve('.output/chrome-mv3');

export default defineConfig({
  test: {
    projects: [
      {
        // Le plugin de test WXT (API navigateur factices, alias) n'est utile que pour
        // les tests unitaires ; en mode navigateur, il chargerait `virtual:wxt-setup`
        // dans le bundle du navigateur.
        plugins: [WxtVitest()],
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.spec.js'],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          // Les extensions Chromium ne se chargent que dans un contexte persistant, et
          // le provider playwright n'en utilise un que si le projet n'ouvre qu'une
          // seule page navigateur.
          maxWorkers: 1,
          browser: {
            enabled: true,
            // https://vitest.dev/config/browser/playwright
            provider: playwright({
              persistentContext: true,
              launchOptions: {
                channel: 'chromium',
                args: [
                  `--disable-extensions-except=${pathToExtension}`,
                  `--load-extension=${pathToExtension}`,
                ],
              },
            }),
            instances: [
              { browser: 'chromium' },
            ],
            // Commandes côté Node donnant accès au contexte Playwright sous-jacent,
            // utilisées par les tests e2e pour piloter l'extension (voir tests/e2e/commands.ts).
            commands: e2eCommands,
          },
        },
      }
    ],
  }
});
