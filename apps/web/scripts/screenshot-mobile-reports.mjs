import { chromium } from '@playwright/test';
import { join } from 'node:path';

const ARTIFACT_DIR = 'C:\\Users\\PC\\.gemini\\antigravity-cli\\brain\\036fe53c-08bd-48a3-acd3-60c99dcfb35a';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();
  await page.goto('http://localhost:3003/', { waitUntil: 'networkidle' });

  const demoBtn = page.getByRole('button', { name: /Modo Demostración/i });
  if (await demoBtn.isVisible()) {
    await demoBtn.click();
    await page.waitForTimeout(2000);
  }

  // Click on "Reportes" tab
  const reportTab = page.locator('button:has-text("Reportes"), a[href*="reports"]').first();
  if (await reportTab.isVisible()) {
    await reportTab.click();
    await page.waitForTimeout(2000);
    const reportPath = join(ARTIFACT_DIR, 'pwa_mobile_reports.png');
    await page.screenshot({ path: reportPath });
    console.log('Capturada pantalla de Reportes PWA ->', reportPath);
  }

  await browser.close();
}

main().catch(console.error);
