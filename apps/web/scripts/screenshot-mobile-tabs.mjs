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

  // Si está en login, clic en demo
  const demoBtn = page.getByRole('button', { name: /Modo Demostración/i });
  if (await demoBtn.isVisible()) {
    await demoBtn.click();
    await page.waitForTimeout(2000);
  }

  // 1. Tab Registrar (FAB Central)
  const fabBtn = page.locator('button:has-text("Registrar"), button:has-text("+"), a[href*="register"]');
  if (await fabBtn.first().isVisible()) {
    await fabBtn.first().click();
    await page.waitForTimeout(1000);
    const regPath = join(ARTIFACT_DIR, 'pwa_mobile_register.png');
    await page.screenshot({ path: regPath });
    console.log('Capturada pantalla de Registro PWA ->', regPath);
  }

  // 2. Tab Asistente
  const assistantTab = page.locator('text=Asistente').first();
  if (await assistantTab.isVisible()) {
    await assistantTab.click();
    await page.waitForTimeout(1500);
    const chatPath = join(ARTIFACT_DIR, 'pwa_mobile_assistant.png');
    await page.screenshot({ path: chatPath });
    console.log('Capturada pantalla de Asistente PWA ->', chatPath);
  }

  await browser.close();
}

main().catch(console.error);
