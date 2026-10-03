import { test, expect } from "vitest";
import { commands } from "vitest/browser";
import type { AnalysisResults } from "./commands.ts";

// Commandes personnalisées enregistrées dans vitest.config.ts (`browser.commands`) ;
// elles s'exécutent dans le processus serveur de Vitest avec accès au contexte
// Playwright sous-jacent.
const e2e = commands as unknown as {
  openDevTools(testPagePath: string): Promise<string>;
  triggerAnalysis(devToolsId: string): Promise<AnalysisResults>;
};

test("Should analyse test_page.html", async () => {
  const devToolsId = await e2e.openDevTools("test_page.html");
  const results = await e2e.triggerAnalysis(devToolsId);

  // devrait retourner 22 = 20 éléments + 2 images svg
  expect(results.domSize).toBe(22);
  expect(results.ecoIndex).toBeCloseTo(95.81, 0);
  expect(results.grade).toBe("A");
  expect(results.requestNumber).toBeGreaterThanOrEqual(6);
  expect(results.requestNumber).toBeLessThanOrEqual(7);
  expect(results.responsesSize).toBe("3 (3)");
  expect(results.waterConsumption).toBeCloseTo(1.63, 1);
  expect(results.greenhouseGasesEmission).toBeCloseTo(1.08, 1);
});
