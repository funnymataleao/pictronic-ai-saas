const fs = require('fs');
const { chromium } = require('playwright');

async function run() {
  const ts = process.env.JUP112_TS;
  const prefix = `docs/e2e/jup112-landing-e2e-${ts}`;
  const projectId = process.env.JUP112_PROJECT_ID;

  const browser = await chromium.launch({ headless: true });
  const summary = {
    ts,
    projectId,
    checks: {}
  };

  const guestDesktop = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const guestDesktopPage = await guestDesktop.newPage();
  await guestDesktopPage.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await guestDesktopPage.screenshot({ path: `${prefix}-guest-desktop.png`, fullPage: true });

  summary.checks.heroVisible = await guestDesktopPage.locator('text=Noir-grade stock production, from prompt to upload.').first().isVisible();
  summary.checks.loginVisible = await guestDesktopPage.getByRole('button', { name: 'Login' }).isVisible();
  summary.checks.fixedHeaderPresent = await guestDesktopPage.evaluate(() => !!document.querySelector('.glass-header'));
  summary.checks.mobileMenuTriggerPresentOnGuest = await guestDesktopPage.evaluate(() => {
    const selectors = [
      'button[aria-label*="menu" i]',
      'button[aria-label*="burger" i]',
      '[data-testid*="menu" i]',
      '[class*="burger" i]'
    ];
    return selectors.some((selector) => document.querySelector(selector));
  });

  await guestDesktop.close();

  const guestMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestMobilePage = await guestMobile.newPage();
  await guestMobilePage.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await guestMobilePage.screenshot({ path: `${prefix}-guest-mobile.png`, fullPage: true });
  summary.checks.mobileHeroVisible = await guestMobilePage.locator('text=Noir-grade stock production, from prompt to upload.').first().isVisible();
  await guestMobile.close();

  const authContext = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  await authContext.request.post('http://127.0.0.1:3000/api/auth/login');

  const authHome = await authContext.newPage();
  await authHome.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await authHome.screenshot({ path: `${prefix}-auth-home-desktop.png`, fullPage: true });

  const homeText = await authHome.textContent('body');
  summary.checks.authHomeRecoveryIndicatorVisible = /recovery/i.test(homeText || '');

  const projectPage = await authContext.newPage();
  await projectPage.goto(`http://127.0.0.1:3000/projects/${projectId}`, { waitUntil: 'networkidle' });
  await projectPage.screenshot({ path: `${prefix}-project-desktop.png`, fullPage: true });

  summary.checks.generateButtonVisible = await projectPage.getByRole('button', { name: 'Generate' }).isVisible();
  summary.checks.startAdobeUploadButtonVisible = await projectPage.getByRole('button', { name: 'Start Adobe Upload' }).isVisible();
  const projectText = await projectPage.textContent('body');
  summary.checks.projectRecoveryIndicatorVisible = /Recovery failed|Infrastructure recovery is in progress|Autonomy Mode is inactive/i.test(projectText || '');

  const authMobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await authMobile.request.post('http://127.0.0.1:3000/api/auth/login');
  const projectMobile = await authMobile.newPage();
  await projectMobile.goto(`http://127.0.0.1:3000/projects/${projectId}`, { waitUntil: 'networkidle' });
  await projectMobile.screenshot({ path: `${prefix}-project-mobile.png`, fullPage: true });
  summary.checks.mobileProjectLoads = await projectMobile.locator('text=Upload Queue').first().isVisible();

  await authMobile.close();
  await authContext.close();
  await browser.close();

  fs.writeFileSync(`${prefix}-playwright-summary.json`, JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
