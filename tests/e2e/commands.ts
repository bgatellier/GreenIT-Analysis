/**
 * Commandes navigateur Vitest côté Node (enregistrées dans vitest.config.ts sous
 * `browser.commands`). Elles s'exécutent dans le processus serveur de Vitest et
 * reçoivent le `BrowserContext` Playwright sous-jacent via le contexte de commande,
 * ce qui permet aux tests e2e de piloter l'extension du navigateur exactement comme
 * l'ancien runner Playwright (capture HAR, API DevTools mockées, id d'extension, ...),
 * tandis que le fichier de test lui-même s'exécute dans le navigateur.
 */
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import type { BrowserCommand, BrowserCommandContext } from 'vitest/node';

interface PlaywrightCommandContext extends BrowserCommandContext {
  context: BrowserContext;
  page: Page;
}

export interface AnalysisResults {
  domSize: number;
  ecoIndex: number;
  grade: string;
  requestNumber: number;
  responsesSize: string;
  waterConsumption: number;
  greenhouseGasesEmission: number;
}

// Les handles Playwright Page ne peuvent pas traverser la frontière RPC : les pages
// devtools sont donc conservées ici et référencées par id depuis les tests.
const devToolsPages = new Map<string, Page>();
let nextDevToolsId = 0;

/**
 * Crée un script d'initialisation qui mock les API DevTools du navigateur.
 *
 * Les tests e2e exécutent l'extension dans un navigateur lancé par Vitest où les
 * objets globaux spécifiques aux DevTools (browser.devtools.network,
 * browser.devtools.inspectedWindow, browser.runtime) ne sont pas disponibles.
 */
function createDevToolsMocksScript(harEntries: any[], url: string) {
  return `(
      function() {
        if (!window.browser) window.browser = {};
        if (!window.browser.devtools) window.browser.devtools = {};
        if (!window.browser.devtools.inspectedWindow) window.browser.devtools.inspectedWindow = {};
        if (!window.browser.devtools.network) window.browser.devtools.network = {};
        if (!window.browser.runtime) window.browser.runtime = {};

        window.browser.devtools.inspectedWindow.tabId = 1;
        window.browser.devtools.inspectedWindow.getResources = function(callback) {
          callback([]);
        };

        // Correction : format HAR correct - simplement { entries: [...] }
        window.browser.devtools.network.getHAR = function(callback) {
          callback({
            entries: ${JSON.stringify(harEntries)}
          });
        };

        // Correction : s'assurer que entries.length > 0 pour déclencher refreshUI
        // Ajoute une entrée de repli si aucune n'a été capturée
        const entries = ${JSON.stringify(harEntries)};
        if (entries.length === 0) {
          entries.push({
            request: { url: '${url}', method: 'GET' },
            response: {
              status: 200,
              statusText: 'OK',
              content: { size: 1000, mimeType: 'text/html' },
              bodySize: 1000,
              _transferSize: 1000,
              headersSize: 200
            }
          });
        }

        window.browser.runtime.connect = function(options) {
          const listeners = [];
          return {
            postMessage: function(msg) {
              if (msg.clearBrowserCache === false) {
                setTimeout(function() {
                  listeners.forEach(function(listener) {
                    listener({
                      analyseStartingTime: Date.now(),
                      url: '${url}',
                      domSize: 22,
                      nbRequest: entries.length,
                      responsesSize: entries.reduce((sum, e) => sum + (e.response?._transferSize || 0), 0),
                      responsesSizeUncompress: entries.reduce((sum, e) => sum + (e.response?.content?.size || 0), 0),
                      printStyleSheetsNumber: 0,
                      inlineStyleSheetsNumber: 0,
                      inlineJsScriptsNumber: 0,
                      inlineJsScript: '',
                      imagesResizedInBrowser: []
                    });
                  });
                }, 100);
              }
            },
            onMessage: {
              addListener: function(listener) { listeners.push(listener); }
            },
            onDisconnect: {
              addListener: function() {}
            }
          };
        };

        window.browser.runtime.getURL = function(path) {
          return 'chrome-extension://test' + path;
        };
        window.browser.runtime.id = 'test-extension';
      }
    )()`;
}

/**
 * Ouvre la page testée dans un nouvel onglet et capture toutes les requêtes et
 * réponses HTTP (format HAR) pendant la navigation.
 */
async function captureHarEntries(context: BrowserContext, url: string) {
  const harEntries: any[] = [];
  const testPage = await context.newPage();

  testPage.on('request', (request) => {
    harEntries.push({
      request: {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
      },
      response: null,
    });
  });

  testPage.on('response', async (response) => {
    const entry = harEntries.findLast(e => e.request.url === response.url());
    if (entry) {
      const headers = response.headers();
      entry.response = {
        status: response.status(),
        statusText: response.statusText(),
        httpVersion: 'HTTP/1.1',
        headers: headers,
        content: {
          size: (await response.body()).length,
          mimeType: headers['content-type'] || ''
        },
        bodySize: (await response.body()).length,
        _transferSize: (await response.body()).length + JSON.stringify(headers).length,
        headersSize: JSON.stringify(headers).length,
      };
    }
  });

  await testPage.goto(url);
  await testPage.waitForLoadState('networkidle');
  await testPage.close();

  // S'assurer qu'on a au moins une entrée (repli pour les fichiers locaux)
  if (harEntries.length === 0) {
    harEntries.push({
      request: { url: url, method: 'GET', headers: {} },
      response: {
        status: 200,
        statusText: 'OK',
        httpVersion: 'HTTP/1.1',
        headers: {},
        content: { size: 1000, mimeType: 'text/html' },
        bodySize: 1000,
        _transferSize: 1200,
        headersSize: 200
      }
    });
  }

  return harEntries;
}

async function getExtensionId(context: BrowserContext) {
  // pour le manifest v3 :
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker)
    serviceWorker = await context.waitForEvent('serviceworker');

  return serviceWorker.url().split('/')[2];
}

export const e2eCommands: Record<string, BrowserCommand<any>> = {
  /**
   * Ouvre `testPagePath` (relatif au fichier de test appelant), capture son trafic
   * réseau, puis ouvre le panneau DevTools de l'extension avec les API DevTools
   * mockées. Retourne un id à passer à `triggerAnalysis`.
   */
  openDevTools: async (ctx: PlaywrightCommandContext, testPagePath: string) => {
    const context = ctx.context;
    const testPageUrl = `file://${path.resolve(path.dirname(ctx.testPath!), testPagePath)}`;

    const harEntries = await captureHarEntries(context, testPageUrl);
    const extensionId = await getExtensionId(context);

    // Ouvre le panneau DevTools
    const devToolsPage = await context.newPage();
    await devToolsPage.addInitScript({
      content: createDevToolsMocksScript(harEntries, testPageUrl)
    });
    await devToolsPage.goto(`chrome-extension://${extensionId}/devtools-panel.html`, { waitUntil: 'domcontentloaded' });
    await devToolsPage.waitForSelector('#launchAnalyse');

    const id = `devtools-${++nextDevToolsId}`;
    devToolsPages.set(id, devToolsPage);
    return id;
  },

  /** Clique sur « launch analyse » dans le panneau DevTools et retourne les résultats affichés. */
  triggerAnalysis: async (ctx: PlaywrightCommandContext, devToolsId: string): Promise<AnalysisResults> => {
    const devToolsPage = devToolsPages.get(devToolsId);
    if (!devToolsPage)
      throw new Error(`Unknown devtools page id "${devToolsId}"`);

    await devToolsPage.check('#analyseBestPracticesCheckBox');
    await devToolsPage.click('#launchAnalyse');

    try {
      await devToolsPage.waitForSelector('#ecoIndexView:visible', { timeout: 30000 });
    } catch (error) {
      console.log('Current page content:', await devToolsPage.content());
      throw error;
    }

    return await devToolsPage.evaluate((): AnalysisResults => {
      return {
        domSize: Number(document.getElementById('domSize')?.textContent),
        ecoIndex: Number(document.getElementById('ecoIndex')?.textContent),
        grade: document.getElementById('grade')?.textContent ?? '',
        requestNumber: Number(document.getElementById('requestNumber')?.textContent),
        responsesSize: document.getElementById('responsesSize')?.textContent ?? '',
        waterConsumption: Number(document.getElementById('waterConsumption')?.textContent),
        greenhouseGasesEmission: Number(document.getElementById('greenhouseGasesEmission')?.textContent),
      };
    });
  },
};
