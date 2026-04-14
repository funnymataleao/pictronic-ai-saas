const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

(async () => {
  const outDir = process.env.OUT_DIR;
  const base = 'http://127.0.0.1:3000/';
  const results = { generatedAt: new Date().toISOString(), base, checks: [] };

  async function runCheck(name, contextOptions, screenshotName) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const requests = [];

    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('http://127.0.0.1:3000') || url.startsWith('http://127.0.0.1:3100')) {
        requests.push({ method: req.method(), resourceType: req.resourceType(), url });
      }
    });

    const response = await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);

    const hero = page.locator('h1.landing-title').first();
    const heroVisible = await hero.isVisible();
    const heroText = (await hero.textContent())?.trim() || null;
    const heroBox = await hero.boundingBox();

    await page.screenshot({ path: path.join(outDir, screenshotName), fullPage: true });
    await browser.close();

    const requestsTo3100 = requests.filter((r) => r.url.startsWith('http://127.0.0.1:3100'));
    const requestsTo3000Api = requests.filter((r) => r.url.includes('127.0.0.1:3000/api/'));

    results.checks.push({
      name,
      httpStatus: response ? response.status() : null,
      heroVisible,
      heroText,
      heroBox,
      requestCount: requests.length,
      requestsTo3000Api: requestsTo3000Api.length,
      requestsTo3100: requestsTo3100.length,
      sampleRequests: requests.slice(0, 30),
    });
  }

  await runCheck('desktop', { viewport: { width: 1440, height: 900 } }, 'landing-desktop.png');
  await runCheck('mobile-iphone-13', { ...devices['iPhone 13'] }, 'landing-mobile-iphone13.png');

  fs.writeFileSync(path.join(outDir, 'playwright-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({
    outDir,
    summary: results.checks.map(c => ({
      name: c.name,
      status: c.httpStatus,
      heroVisible: c.heroVisible,
      heroText: c.heroText,
      to3100: c.requestsTo3100,
      to3000Api: c.requestsTo3000Api,
      requests: c.requestCount
    }))
  }, null, 2));
})();
