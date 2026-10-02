import { chromium } from '@playwright/test';
import { copyFileSync, existsSync } from 'node:fs';
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
  console.log('Cargando CryoTech Mobile PWA en http://localhost:3003 ...');
  await page.goto('http://localhost:3003/', { waitUntil: 'networkidle' });

  // 1. Capturar pantalla de Login PWA
  const loginPath = join(ARTIFACT_DIR, 'pwa_mobile_login.png');
  await page.screenshot({ path: loginPath });
  console.log('Capturada pantalla de Login PWA ->', loginPath);

  // 2. Si está en login, probar botón de demostración o verificar contenido
  const demoBtn = page.getByRole('button', { name: /Modo Demostración/i });
  if (await demoBtn.isVisible()) {
    console.log('Haciendo clic en Probar Modo Demostración...');
    await demoBtn.click();
    await page.waitForTimeout(3500);
    const homePath = join(ARTIFACT_DIR, 'pwa_mobile_home.png');
    await page.screenshot({ path: homePath });
    console.log('Capturada pantalla de Inicio PWA ->', homePath);
  }

  await browser.close();
}

main().catch((err) => {
  console.error('Error en captura:', err);
  process.exit(1);
});
