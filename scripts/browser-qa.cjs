#!/usr/bin/env node
'use strict';

// Development-only browser verification. No browser package ships with the site.
// NODE_PATH=/path/to/node_modules node scripts/browser-qa.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const site = path.join(root, 'site');
const origin = process.env.SHOWCASE_QA_ORIGIN || 'http://localhost:4173';
const reportPath = path.join(root, 'verification/browser-qa.json');
const sourceData = JSON.parse(fs.readFileSync(path.join(site, 'data/research.json'), 'utf8'));
const report = {
  startedAt: new Date().toISOString(),
  origin,
  browser: 'Chromium / Playwright; independent browser and isolated contexts',
  checks: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  httpErrors: [],
  localLinks: [],
  externalLinks: [],
};

function siteHashes() {
  return Object.fromEntries(['index.html', 'app.js', 'styles.css', 'data/research.js'].map(file => [
    file, crypto.createHash('sha256').update(fs.readFileSync(path.join(site, file))).digest('hex'),
  ]));
}

async function check(name, work) {
  try {
    const detail = await work();
    report.checks.push({name, status: 'passed', ...(detail === undefined ? {} : {detail})});
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({name, status: 'failed', error: error.message});
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function monitor(page, scope) {
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push({scope, message: message.text()});
  });
  page.on('pageerror', error => report.pageErrors.push({scope, message: error.message}));
  page.on('requestfailed', request => report.failedRequests.push({scope, url: request.url(), error: request.failure()?.errorText}));
  page.on('response', response => {
    if (response.status() >= 400) report.httpErrors.push({scope, url: response.url(), status: response.status()});
  });
}

async function ready(page, url = origin) {
  await page.goto(url, {waitUntil: 'networkidle', timeout: 15000});
  await page.waitForFunction(() => window.SCALING_DATA && document.querySelectorAll('#family-toggles button').length === 8);
  await page.evaluate(() => document.fonts.ready);
}

async function frames(page, count = 8) {
  await page.evaluate(total => new Promise(resolve => {
    function next(remaining) {
      if (remaining === 0) resolve();
      else requestAnimationFrame(() => next(remaining - 1));
    }
    next(total);
  }), count);
}

async function pressedFamilies(page) {
  return page.locator('[data-family][aria-pressed="true"]').evaluateAll(buttons => buttons.map(button => button.dataset.family).sort());
}

async function verifyNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  assert(dimensions.documentWidth <= dimensions.viewport + 1, JSON.stringify(dimensions));
  assert(dimensions.bodyWidth <= dimensions.viewport + 1, JSON.stringify(dimensions));
  return dimensions;
}

async function ensureServer() {
  try {
    const response = await fetch(origin, {signal: AbortSignal.timeout(1500)});
    if (response.ok) return null;
    throw new Error(`Existing server returned ${response.status}`);
  } catch (error) {
    if (process.env.SHOWCASE_QA_ORIGIN) throw error;
  }
  const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.txt': 'text/plain'};
  const server = http.createServer((request, response) => {
    let requested;
    try {
      requested = decodeURIComponent(new URL(request.url, origin).pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const filename = path.resolve(site, `.${requested === '/' ? '/index.html' : requested}`);
    if (!filename.startsWith(site + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filename, (error, bytes) => {
      if (error) response.writeHead(404).end();
      else response.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream'}).end(bytes);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4173, 'localhost', resolve);
  });
  report.temporaryServerStarted = true;
  return server;
}

async function run() {
  report.siteHashesBefore = siteHashes();
  let browser;
  let server;
  try {
    server = await ensureServer();
    browser = await chromium.launch({headless: true});
    report.browserVersion = browser.version();
    const desktop = await browser.newContext({viewport: {width: 1440, height: 1000}});
    const page = await desktop.newPage();
    monitor(page, 'desktop');
    await ready(page);

    await check('Browser-loaded research data exactly matches generated JSON', async () => {
      assert.deepEqual(await page.evaluate(() => window.SCALING_DATA), sourceData);
    });

    await check('Family toggles and presets control the plotted series and expose state', async () => {
      const story = ['glm', 'hybrid', 'tabm', 'transformer'];
      assert.deepEqual(await pressedFamilies(page), story);
      assert.equal(await page.locator('#results-chart .series-path').count(), 4);
      await page.locator('[data-preset="all"]').click();
      assert.equal(await page.locator('#results-chart .series-path').count(), 8);
      assert.equal(await page.locator('[data-preset="all"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-preset="story"]').getAttribute('aria-pressed'), 'false');
      for (const family of sourceData.families) {
        const button = page.locator(`[data-family="${family.id}"]`);
        await button.click();
        assert.equal(await button.getAttribute('aria-pressed'), 'false', family.id);
        assert.equal(await page.locator('#results-chart .series-path').count(), 7, family.id);
        assert.equal(await page.locator('[data-preset="all"]').getAttribute('aria-pressed'), 'false');
        await button.click();
        assert.equal(await page.locator('#results-chart .series-path').count(), 8, family.id);
      }
      for (const family of sourceData.families) await page.locator(`[data-family="${family.id}"]`).click();
      assert.equal((await pressedFamilies(page)).length, 1, 'Final visible family must remain available');
      assert.equal(await page.locator('#results-chart .series-path').count(), 1);
      await page.locator('[data-preset="story"]').click();
      assert.deepEqual(await pressedFamilies(page), story);
      assert.equal(await page.locator('[data-preset="story"]').getAttribute('aria-pressed'), 'true');
      await page.locator('[data-preset="all"]').click();
    });

    await check('All 48 chart point labels match the research package', async () => {
      const actual = await page.locator('#results-chart circle title').allTextContents();
      const expected = sourceData.families.flatMap(family => family.values.map((value, index) => `${family.shortName} · ${sourceData.fractions[index] * 100}%: ${value.toFixed(5)}`));
      assert.deepEqual(actual, expected);
      const pathCoordinates = await page.locator('#results-chart .series-path').evaluateAll(paths => paths.map(item => item.getAttribute('d')));
      assert.equal(pathCoordinates.length, 8);
      for (const coordinates of pathCoordinates) {
        assert(!/NaN|Infinity/.test(coordinates));
        assert.equal((coordinates.match(/L/g) || []).length, 5);
      }
    });

    await check('Six keyboard slider positions show correct observed leaders with extensions off and on', async () => {
      const outcomes = [];
      const slider = page.locator('#data-fraction');
      for (const extensions of [false, true]) {
        await page.locator('#extensions').setChecked(extensions);
        await slider.focus();
        await page.keyboard.press('Home');
        for (let index = 0; index < sourceData.fractions.length; index++) {
          if (index) await page.keyboard.press('ArrowRight');
          const candidates = sourceData.families.map(family => ({name: family.shortName, value: family.values[index]}));
          if (extensions && index === 5) candidates.push(...sourceData.extensions.map(extension => ({name: extension.name, value: extension.value})));
          candidates.sort((a, b) => a.value - b.value);
          assert.equal(await slider.inputValue(), String(index));
          assert.equal(await page.locator('#selected-loss').textContent(), candidates[0].value.toFixed(5));
          assert.equal(await page.locator('#selected-leader').textContent(), candidates[0].name);
          assert.equal(await page.locator('#selected-fraction').textContent(), `${sourceData.fractions[index] * 100}% of training data`);
          assert.equal(await slider.getAttribute('aria-valuetext'), `${sourceData.fractions[index] * 100} percent, ${sourceData.trainingRows[index].toLocaleString('en-US')} training records`);
          assert.equal(await page.locator('#results-chart .active-point').count(), 8);
          outcomes.push({extensions, fraction: sourceData.fractions[index], leader: candidates[0].name, deviance: candidates[0].value.toFixed(5)});
        }
      }
      return outcomes;
    });

    await check('Full-data extensions remain separate diamonds without replacing the main-sweep paths', async () => {
      await page.locator('#extensions').uncheck();
      const mainPaths = await page.locator('#results-chart .series-path').evaluateAll(paths => paths.map(item => item.getAttribute('d')));
      assert.equal(await page.locator('#results-chart path title').count(), 0);
      await page.locator('#extensions').check();
      const diamondTitles = await page.locator('#results-chart path title').allTextContents();
      assert.deepEqual(diamondTitles, sourceData.extensions.map(extension => `${extension.name} · full-data-only: ${extension.value.toFixed(5)}`));
      assert.deepEqual(await page.locator('#results-chart .series-path').evaluateAll(paths => paths.map(item => item.getAttribute('d'))), mainPaths);
      assert.equal(await page.locator('#results-chart circle').count(), 48);
      await page.locator('[data-family="ssl"]').click();
      assert.equal(await page.locator('#results-chart path title').count(), 2);
      await page.locator('[data-family="tabm"]').click();
      assert.equal(await page.locator('#results-chart path title').count(), 0);
      await page.locator('[data-preset="all"]').click();
    });

    await check('Chart pointer targets select all six training fractions', async () => {
      for (let index = 0; index < 6; index++) {
        await page.locator(`#results-chart [data-index="${index}"]`).click();
        assert.equal(await page.locator('#data-fraction').inputValue(), String(index));
      }
    });

    await check('Accessible results table contains all 11 result rows with exact displayed values', async () => {
      await page.locator('#results .data-details > summary').click();
      assert.equal(await page.locator('#results-table tbody tr').count(), 11);
      const actual = await page.locator('#results-table tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent)));
      const expected = sourceData.families.map(family => family.values.map(value => value.toFixed(5)));
      expected.push(...sourceData.extensions.map(extension => ['—', '—', '—', '—', '—', extension.value.toFixed(5)]));
      assert.deepEqual(actual, expected);
      assert.equal(await page.locator('#results-table tbody th[scope="row"]').count(), 11);
      assert.equal(await page.locator('#results-table thead th[scope="col"]').count(), 7);
    });

    await check('Two-resource lab keyboard slider matches the main-sweep data and full-data parameter fits at all five positions', async () => {
      await page.locator('#fit-family').selectOption('tabm');
      const fit = sourceData.scalingFits.find(item => item.familyId === 'tabm');
      const slider = page.locator('#doublings');
      await slider.focus();
      await page.keyboard.press('Home');
      const outcomes = [];
      for (let doublings = 0; doublings <= 4; doublings++) {
        if (doublings) await page.keyboard.press('ArrowRight');
        const multiplier = 2 ** doublings;
        const dataRemaining = 100 * multiplier ** -fit.dataExponent;
        const parameterRemaining = 100 * multiplier ** -fit.parameterExponent;
        assert.equal(await slider.inputValue(), String(doublings));
        assert.equal(await page.locator('#data-gap-remaining').textContent(), `${dataRemaining.toFixed(1)}%`);
        assert.equal(await page.locator('#parameter-gap-remaining').textContent(), `${parameterRemaining.toFixed(1)}%`);
        assert.equal(await page.locator('#data-multiplier').textContent(), `${multiplier}×`);
        assert.equal(await slider.getAttribute('aria-valuetext'), `${multiplier} times the resource: data curve ${dataRemaining.toFixed(1)} percent remaining, parameter curve ${parameterRemaining.toFixed(1)} percent remaining`);
        for (const [resource, expected] of [['D', dataRemaining], ['P', parameterRemaining]]) {
          const observed = Number(await page.locator(`#resource-chart [data-resource="${resource}"][data-step="${doublings}"]`).getAttribute('data-remaining'));
          assert(Math.abs(observed - expected) < 1e-10);
        }
        outcomes.push({doublings, multiplier, dataRemainingPercent: dataRemaining.toFixed(1), parameterRemainingPercent: parameterRemaining.toFixed(1)});
      }
      return outcomes;
    });

    await check('Architecture tabs support arrows, wrap-around, Home/End and accessible panel association', async () => {
      await page.locator('#tab-tabm').focus();
      const steps = [['ArrowRight', 'ssl'], ['ArrowRight', 'glm'], ['ArrowLeft', 'ssl'], ['Home', 'glm'], ['ArrowRight', 'transformer'], ['End', 'ssl']];
      const descriptions = new Set();
      for (const [key, model] of steps) {
        await page.keyboard.press(key);
        assert.equal(await page.locator('[role="tab"][aria-selected="true"]').count(), 1);
        assert.equal(await page.locator(`#tab-${model}`).getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('#architecture-panel').getAttribute('aria-labelledby'), `tab-${model}`);
        assert.equal(await page.evaluate(() => document.activeElement.id), `tab-${model}`);
        assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
        descriptions.add(await page.locator('#architecture-description').textContent());
        assert((await page.locator('#architecture-svg').getAttribute('aria-label')).length > 30);
      }
      assert.equal(descriptions.size, 3);
    });

    await check('Every local anchor and downloadable/loaded resource resolves without HTTP errors', async () => {
      const resources = await page.evaluate(() => [...new Set([
        ...[...document.querySelectorAll('[href]')].map(element => element.getAttribute('href')),
        ...[...document.querySelectorAll('[src]')].map(element => element.getAttribute('src')),
      ])]);
      const local = resources.filter(url => url && !/^(?:https?:|mailto:|data:)/.test(url));
      for (const resource of local) {
        if (resource.startsWith('#')) {
          const exists = await page.evaluate(id => !!document.getElementById(id), resource.slice(1));
          assert(exists, `Broken anchor: ${resource}`);
          report.localLinks.push({url: resource, status: 'anchor_exists'});
        } else {
          const response = await desktop.request.get(new URL(resource, origin).href);
          report.localLinks.push({url: resource, status: response.status()});
          assert(response.ok(), `${resource}: HTTP ${response.status()}`);
        }
      }
      return {checked: local.length};
    });

    await check('Public companion implementation link resolves', async () => {
      const urls = await page.locator('a[href^="https://"]').evaluateAll(links => [...new Set(links.map(link => link.href))]);
      for (const url of urls) {
        const response = await desktop.request.get(url, {timeout: 20000});
        report.externalLinks.push({url, status: response.status()});
        assert(response.ok(), `${url}: HTTP ${response.status()}`);
      }
    });

    for (const width of [320, 390, 768, 1440]) {
      await check(`Responsive viewport ${width}px has no horizontal document overflow, including opened controls`, async () => {
        const context = await browser.newContext({viewport: {width, height: 900}, isMobile: width < 600, hasTouch: width < 600});
        try {
          const responsivePage = await context.newPage();
          monitor(responsivePage, `viewport-${width}`);
          await ready(responsivePage);
          const before = await verifyNoOverflow(responsivePage);
          await responsivePage.locator('[data-preset="all"]').click();
          await responsivePage.locator('#extensions').check();
          await responsivePage.locator('#results .data-details > summary').click();
          const openTable = await verifyNoOverflow(responsivePage);
          const tableRegion = responsivePage.locator('#results .data-details .table-scroll');
          assert.equal(await tableRegion.getAttribute('tabindex'), '0');
          if (width < 600) {
            await responsivePage.locator('.menu-toggle').click();
            assert.equal(await responsivePage.locator('.menu-toggle').getAttribute('aria-expanded'), 'true');
            assert(await responsivePage.locator('#main-nav').isVisible());
            await verifyNoOverflow(responsivePage);
            await responsivePage.keyboard.press('Escape');
            assert.equal(await responsivePage.locator('.menu-toggle').getAttribute('aria-expanded'), 'false');
            assert.equal(await responsivePage.evaluate(() => document.activeElement.classList.contains('menu-toggle')), true);
          }
          return {before, openTable, mobileMenuEscapeTested: width < 600};
        } finally {
          await context.close();
        }
      });
    }

    await check('Reduced-motion preference pauses the canvas and removes CSS transitions, including live preference changes', async () => {
      const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
      try {
        const reducedPage = await context.newPage();
        monitor(reducedPage, 'reduced-motion');
        await ready(reducedPage);
        const button = reducedPage.locator('#motion-toggle');
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        assert.equal(await button.getAttribute('aria-label'), 'Play landscape animation');
        assert.equal(await reducedPage.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
        assert.equal(await reducedPage.locator('.button').first().evaluate(element => getComputedStyle(element).transitionDuration), '0s');
        await frames(reducedPage);
        const still = await reducedPage.locator('#landscape').evaluate(canvas => canvas.toDataURL());
        await frames(reducedPage);
        assert.equal(await reducedPage.locator('#landscape').evaluate(canvas => canvas.toDataURL()), still);
        await reducedPage.emulateMedia({reducedMotion: 'no-preference'});
        await reducedPage.waitForFunction(() => document.querySelector('#motion-toggle').getAttribute('aria-pressed') === 'false');
        await frames(reducedPage, 12);
        assert.notEqual(await reducedPage.locator('#landscape').evaluate(canvas => canvas.toDataURL()), still);
        await reducedPage.emulateMedia({reducedMotion: 'reduce'});
        await reducedPage.waitForFunction(() => document.querySelector('#motion-toggle').getAttribute('aria-pressed') === 'true');
        await frames(reducedPage);
        const pausedAgain = await reducedPage.locator('#landscape').evaluate(canvas => canvas.toDataURL());
        await frames(reducedPage);
        assert.equal(await reducedPage.locator('#landscape').evaluate(canvas => canvas.toDataURL()), pausedAgain);
      } finally {
        await context.close();
      }
    });

    await check('Standalone file:// loading renders the data, interactive chart and local downloads', async () => {
      const context = await browser.newContext({viewport: {width: 1280, height: 900}});
      try {
        const filePage = await context.newPage();
        monitor(filePage, 'file-protocol');
        await ready(filePage, pathToFileURL(path.join(site, 'index.html')).href);
        assert.deepEqual(await filePage.evaluate(() => window.SCALING_DATA), sourceData);
        await filePage.locator('[data-preset="all"]').click();
        await filePage.locator('#extensions').check();
        assert.equal(await filePage.locator('#results-chart .series-path').count(), 8);
        assert.equal(await filePage.locator('#selected-loss').textContent(), '0.28885');
        assert.equal(await filePage.locator('#results-table tbody tr').count(), 11);
        const localTargets = await filePage.locator('a[href$=".pdf"], a[download]').evaluateAll(links => links.map(link => link.href));
        for (const target of localTargets) {
          assert.equal(new URL(target).protocol, 'file:');
          assert(fs.existsSync(new URL(target)), target);
        }
        return {downloadTargets: localTargets.length};
      } finally {
        await context.close();
      }
    });

    await check('Browsers produce no console errors, uncaught exceptions, failed requests or HTTP errors', async () => {
      assert.deepEqual(report.consoleErrors, []);
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.failedRequests, []);
      assert.deepEqual(report.httpErrors, []);
    });
    await desktop.close();
  } catch (error) {
    report.checks.push({name: 'QA harness setup/execution', status: 'failed', error: error.stack});
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    report.siteHashesAfter = siteHashes();
    report.siteChangedDuringRun = JSON.stringify(report.siteHashesBefore) !== JSON.stringify(report.siteHashesAfter);
    report.finishedAt = new Date().toISOString();
    report.summary = {
      passed: report.checks.filter(result => result.status === 'passed').length,
      failed: report.checks.filter(result => result.status === 'failed').length,
    };
    fs.mkdirSync(path.dirname(reportPath), {recursive: true});
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.summary));
    process.exitCode = report.summary.failed ? 1 : 0;
  }
}

run();
