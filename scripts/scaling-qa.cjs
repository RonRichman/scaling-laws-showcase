#!/usr/bin/env node
'use strict';

// Development-only QA for the observed-size explorer and fitted D/P comparison.
// NODE_PATH=/path/to/node_modules node scripts/scaling-qa.cjs
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
const data = JSON.parse(fs.readFileSync(path.join(site, 'data/research.json'), 'utf8'));
const groups = ['tabm', 'tabm_mini', 'transformer', 'ffn', 'multicls', 'hybrid', 'moe', 'ssl'];
const report = {startedAt: new Date().toISOString(), origin, checks: [], consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], observedMatrix: [], fittedMatrix: []};

function modelsFor(group) {
  if (group === 'tabm') return data.sizeLadders.tabm.filter(model => !model.configuration.startsWith('tabm_mini_'));
  if (group === 'tabm_mini') return data.sizeLadders.tabm.filter(model => model.configuration.startsWith('tabm_mini_'));
  return data.sizeLadders[group];
}

function extensionsFor(group) {
  return group === 'tabm_mini' ? data.extensions.filter(model => model.familyId === 'tabm') : group === 'ssl' ? data.extensions.filter(model => model.familyId === 'ssl') : [];
}

function hashes() {
  return Object.fromEntries(['index.html', 'app.js', 'styles.css', 'scaling-explorers.js', 'scaling-explorers.css', 'data/research.js'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(site, file))).digest('hex')]));
}

function nearly(actual, expected, message = '', tolerance = 1e-10) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${message}: observed ${actual}, expected ${expected}`);
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
  page.on('console', message => {if (message.type() === 'error') report.consoleErrors.push({scope, message: message.text()});});
  page.on('pageerror', error => report.pageErrors.push({scope, message: error.message}));
  page.on('requestfailed', request => report.failedRequests.push({scope, url: request.url(), error: request.failure()?.errorText}));
  page.on('response', response => {if (response.status() >= 400) report.httpErrors.push({scope, url: response.url(), status: response.status()});});
}

async function ready(page, url = origin) {
  await page.goto(url, {waitUntil: 'networkidle', timeout: 15000});
  await page.waitForFunction(() => window.SCALING_DATA && document.querySelectorAll('#size-chart .size-point').length > 0 && document.querySelectorAll('#exponent-table tbody tr').length === 8);
  await page.evaluate(() => document.fonts.ready);
}

async function sliderAt(page, selector, index) {
  const slider = page.locator(selector);
  await slider.focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < index; step++) await page.keyboard.press('ArrowRight');
  assert.equal(await slider.inputValue(), String(index));
}

async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth}));
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
  const mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.csv': 'text/csv', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.woff2': 'font/woff2'};
  const server = http.createServer((request, response) => {
    let pathname;
    try {pathname = decodeURIComponent(new URL(request.url, origin).pathname);} catch {response.writeHead(400).end(); return;}
    const filename = path.resolve(site, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filename.startsWith(site + path.sep)) {response.writeHead(403).end(); return;}
    fs.readFile(filename, (error, bytes) => {
      if (error) response.writeHead(404).end();
      else response.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream'}).end(bytes);
    });
  });
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(4173, 'localhost', resolve);});
  report.temporaryServerStarted = true;
  return server;
}

function verifyCoordinates(points, axis) {
  for (const point of points) assert(Number.isFinite(point.x) && Number.isFinite(point.y), 'Non-finite chart coordinates');
  const lowLoss = points.reduce((best, point) => point.loss < best.loss ? point : best);
  const highLoss = points.reduce((best, point) => point.loss > best.loss ? point : best);
  assert(lowLoss.y > highLoss.y, 'Lower loss must appear lower on the chart');
  const lowX = points.reduce((best, point) => point.resource < best.resource ? point : best);
  const highX = points.reduce((best, point) => point.resource > best.resource ? point : best);
  assert(highX.x > lowX.x, `${axis} must increase to the right`);
  for (const point of points) {
    nearly((point.y - lowLoss.y) / (highLoss.y - lowLoss.y), (point.loss - lowLoss.loss) / (highLoss.loss - lowLoss.loss), 'Linear loss-axis position', 1e-8);
    nearly((point.x - lowX.x) / (highX.x - lowX.x), Math.log(point.resource / lowX.resource) / Math.log(highX.resource / lowX.resource), `Logarithmic ${axis}-axis position`, 1e-8);
  }
}

async function observedState(page, group, axis, index, includeExtensions = false) {
  const models = modelsFor(group);
  const extensions = includeExtensions && index === 5 ? extensionsFor(group) : [];
  const points = await page.locator('#size-chart .size-point').evaluateAll(elements => elements.map(element => ({
    configuration: element.dataset.config,
    loss: Number(element.dataset.loss),
    parameters: element.dataset.parameters === undefined ? null : Number(element.dataset.parameters),
    fractionIndex: element.dataset.fraction === undefined ? null : Number(element.dataset.fraction),
    x: Number(element.getAttribute('cx')), y: Number(element.getAttribute('cy')), radius: Number(element.getAttribute('r')),
  })));
  assert.equal(points.length, models.length * (axis === 'D' ? 6 : 1));
  assert.equal(await page.locator('#size-chart .observed-size-line').count(), axis === 'D' ? models.length : 1);
  assert.equal(await page.locator(`[data-size-axis="${axis}"]`).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-size-axis][aria-pressed="true"]').count(), 1);
  for (const point of points) {
    const model = models.find(item => item.configuration === point.configuration);
    assert(model, `Unexpected model ${point.configuration}`);
    const observedIndex = axis === 'D' ? point.fractionIndex : index;
    nearly(point.loss, model.values[observedIndex], point.configuration);
    if (axis === 'P') assert.equal(point.parameters, model.parameterCounts[index]);
    else assert.equal(point.radius, point.fractionIndex === index ? 6 : 3.5);
    point.resource = axis === 'D' ? data.trainingRows[observedIndex] : model.parameterCounts[index];
  }
  verifyCoordinates(points, axis);
  const candidates = models.map(model => ({name: model.name, parameters: model.parameterCounts[index], loss: model.values[index]}));
  candidates.push(...extensions.map(model => ({name: model.name, parameters: model.parameterCount, loss: model.value})));
  candidates.sort((a, b) => a.loss - b.loss);
  const winner = candidates[0];
  assert.equal(await page.locator('#size-winner').textContent(), winner.name);
  assert.equal(await page.locator('#size-best-loss').textContent(), winner.loss.toFixed(5));
  assert.equal(await page.locator('#size-winner-params').textContent(), `${winner.parameters.toLocaleString('en-US')} trainable parameters`);
  assert.equal(await page.locator('#size-fraction-label').textContent(), `${data.fractions[index] * 100}% · ${data.trainingRows[index].toLocaleString('en-US')} rows`);
  assert.equal(await page.locator('#size-fraction').getAttribute('aria-valuetext'), `${data.fractions[index] * 100} percent, ${data.trainingRows[index].toLocaleString('en-US')} training rows`);
  assert.equal(await page.locator('#size-chart .size-extension').count(), extensions.length);
  const extensionButton = page.locator('#size-extensions');
  assert.equal(await extensionButton.isDisabled(), !(index === 5 && extensionsFor(group).length > 0));
  assert.equal(await page.locator('#capacity-workflow-note').isVisible(), group === 'tabm_mini', 'Same-capacity workflow caveat must remain visible for TabM-mini even without extensions');
  const result = {group, axis, fraction: data.fractions[index], includeExtensions, points: points.length, extensions: extensions.length, winner: winner.name, deviance: winner.loss.toFixed(5), trainableParameters: winner.parameters};
  report.observedMatrix.push(result);
  return result;
}

async function run() {
  report.siteHashesBefore = hashes();
  let server;
  let browser;
  try {
    server = await ensureServer();
    browser = await chromium.launch({headless: true});
    report.browserVersion = browser.version();
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
    const page = await context.newPage();
    monitor(page, 'desktop');
    await ready(page);

    await check('Observed data-return comparison uses exact row intervals and per-million-row arithmetic', async () => {
      const glm = data.families.find(family => family.id === 'glm');
      const intervals = [{prefix: 'early', start: 0, end: 1}, {prefix: 'late', start: 3, end: 5}];
      const calculations = [];
      for (const interval of intervals) {
        const added = data.trainingRows[interval.end] - data.trainingRows[interval.start];
        const gain = glm.values[interval.start] - glm.values[interval.end];
        const unit = gain / added * 1e6;
        assert.equal(await page.locator(`#${interval.prefix}-added`).textContent(), added.toLocaleString('en-US'));
        assert.equal(await page.locator(`#${interval.prefix}-gain`).textContent(), gain.toFixed(6));
        assert.equal(await page.locator(`#${interval.prefix}-unit`).textContent(), unit.toFixed(6));
        calculations.push({added, gain, perMillionRows: unit});
      }
      const ratio = calculations[0].perMillionRows / calculations[1].perMillionRows;
      assert.equal(await page.locator('#return-ratio').textContent(), ratio.toFixed(0));
      assert.equal(await page.locator('#return-ratio-copy').textContent(), ratio.toFixed(0));
      nearly(await page.locator('#late-return-bar').evaluate(element => parseFloat(element.style.width)), 100 / ratio, 'Relative late-return bar', 1e-4);
      return {calculations, earlyToLateReturnRatio: ratio};
    });

    await check('Explorer exposes all 8 UI groups and all 33 configurations / 198 observed scores', async () => {
      assert.deepEqual(await page.locator('#size-family option').evaluateAll(options => options.map(option => option.value)), groups);
      assert.equal(await page.locator('#size-config-count').textContent(), '33');
      assert.equal(await page.locator('#size-score-count').textContent(), '198');
      const exportedModels = Object.values(data.sizeLadders).flat();
      assert.equal(new Set(groups.flatMap(group => modelsFor(group).map(model => model.configuration))).size, exportedModels.length);
    });

    for (const group of groups) {
      for (const axis of ['D', 'P']) {
        await check(`${group}: all six data fractions in ${axis} mode match scores, parameters, geometry, winners and extension gating`, async () => {
          await page.locator('#size-family').selectOption(group);
          await page.locator(`[data-size-axis="${axis}"]`).click();
          await sliderAt(page, '#size-fraction', 0);
          for (let index = 0; index < 6; index++) {
            if (index) await page.keyboard.press('ArrowRight');
            await observedState(page, group, axis, index);
          }
          return {fractions: 6, configurations: modelsFor(group).length};
        });
      }
    }

    await check('Full-data extensions are distinct correctly scored diamonds, appear only at 100%, and disappear for ineligible groups', async () => {
      for (const group of ['tabm_mini', 'ssl']) {
        for (const axis of ['D', 'P']) {
          await page.locator('#size-family').selectOption(group);
          await page.locator(`[data-size-axis="${axis}"]`).click();
          await sliderAt(page, '#size-fraction', 5);
          await page.locator('#size-extensions').check();
          await observedState(page, group, axis, 5, true);
          for (const extension of extensionsFor(group)) {
            const diamond = page.locator(`#size-chart .size-extension[data-config="${extension.configuration}"]`);
            nearly(Number(await diamond.getAttribute('data-loss')), extension.value, extension.name);
            assert.match(await diamond.getAttribute('d'), /^M[\d.e+-]+ [\d.e+-]+l7 7-7 7-7-7Z$/);
            assert.match(await diamond.locator('title').textContent(), /full-data-only/);
          }
          for (let index = 0; index < 5; index++) {
            await sliderAt(page, '#size-fraction', index);
            await observedState(page, group, axis, index, true);
          }
          await sliderAt(page, '#size-fraction', 5);
          await page.locator('#size-extensions').uncheck();
        }
      }
      await page.locator('#size-family').selectOption('tabm_mini');
      await page.locator('#size-extensions').check();
      for (const group of groups.filter(group => !['tabm_mini', 'ssl'].includes(group))) {
        await page.locator('#size-family').selectOption(group);
        assert(await page.locator('#size-extensions').isDisabled());
        assert.equal(await page.locator('#size-chart .size-extension').count(), 0);
      }
    });

    await check('TabM-mini xlarge and xlarge-2 remain separate observations at the same parameter count', async () => {
      await page.locator('#size-family').selectOption('tabm_mini');
      await page.locator('[data-size-axis="P"]').click();
      await sliderAt(page, '#size-fraction', 5);
      await page.locator('#size-extensions').check();
      const same = data.extensions.find(extension => extension.sameArchitectureAs);
      const main = page.locator(`#size-chart circle[data-config="${same.sameArchitectureAs}"]`);
      const extension = page.locator(`#size-chart path[data-config="${same.configuration}"]`);
      const pathData = await extension.getAttribute('d');
      const [diamondX, diamondTopY] = pathData.match(/^M([\d.e+-]+) ([\d.e+-]+)/).slice(1).map(Number);
      nearly(Number(await main.getAttribute('cx')), diamondX, 'Equal-P x coordinates');
      assert(Number(await main.getAttribute('cy')) < diamondTopY + 7, 'The lower-loss extension must appear below the main-sweep point');
      assert.equal(Number(await main.getAttribute('data-parameters')), same.parameterCount);
      assert(await page.locator('#capacity-workflow-note').isVisible());
      assert.match((await page.locator('#capacity-workflow-note').textContent()).replace(/\s+/g, ' '), /same architecture|same.*parameter/i);
      return {parameters: same.parameterCount, distinctResultsAtEqualCapacity: true};
    });

    await check('Three story links set the intended family, parameter axis, data fraction and keyboard focus', async () => {
      for (const [story, group, index] of [['reversal', 'tabm', 0], ['plateau', 'tabm', 5], ['transformer', 'transformer', 5]]) {
        await page.locator('[data-size-axis="D"]').click();
        await page.locator(`[data-size-story="${story}"]`).click();
        assert.equal(await page.locator('#size-family').inputValue(), group);
        assert.equal(await page.locator('#size-fraction').inputValue(), String(index));
        assert.equal(await page.locator('[data-size-axis="P"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'size-family');
        await observedState(page, group, 'P', index);
      }
    });

    await check('Size tables preserve all configuration scores and full-data trainable counts across 8 groups', async () => {
      for (const group of groups) {
        await page.locator('#size-family').selectOption(group);
        const actual = await page.locator('#size-table tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent)));
        const expected = modelsFor(group).map(model => [model.parameterCounts[5].toLocaleString('en-US'), ...model.values.map(loss => loss.toFixed(6))]);
        expected.push(...extensionsFor(group).map(model => [model.parameterCount.toLocaleString('en-US'), '—', '—', '—', '—', '—', model.value.toFixed(6)]));
        assert.deepEqual(actual, expected, group);
        assert.equal(await page.locator('#size-table th[scope="row"]').count(), expected.length);
      }
    });

    for (const fit of data.scalingFits) {
      await check(`${fit.familyId}: five native slider outcomes and all marginal returns match separate fitted D/P laws`, async () => {
        await page.locator('#fit-family').selectOption(fit.familyId);
        await sliderAt(page, '#doublings', 0);
        for (let step = 0; step <= 4; step++) {
          if (step) await page.keyboard.press('ArrowRight');
          const multiplier = 2 ** step;
          const remainingD = 100 * multiplier ** -fit.dataExponent;
          const remainingP = fit.parameterExponent === null ? null : 100 * multiplier ** -fit.parameterExponent;
          assert.equal(await page.locator('#data-gap-remaining').textContent(), `${remainingD.toFixed(1)}%`);
          assert.equal(await page.locator('#parameter-gap-remaining').textContent(), remainingP === null ? '—' : `${remainingP.toFixed(1)}%`);
          assert.equal(await page.locator('#data-multiplier').textContent(), `${multiplier}×`);
          assert.equal(await page.locator('#doublings').getAttribute('aria-valuetext'), `${multiplier} times the resource: data curve ${remainingD.toFixed(1)} percent remaining${remainingP === null ? '' : `, parameter curve ${remainingP.toFixed(1)} percent remaining`}`);
          const parameterPoints = page.locator('#resource-chart [data-resource="P"]');
          assert.equal(await parameterPoints.count(), fit.parameterExponent === null ? 0 : 6);
          assert.equal(await page.locator('#parameter-legend').isVisible(), fit.parameterExponent !== null);
          if (fit.parameterExponent === null) {
            assert.doesNotMatch(await page.locator('#resource-chart-title').textContent(), /D and P/);
            assert.match(await page.locator('#resource-chart-description').textContent(), /No parameter-scaling fit/);
            if (step === 0) assert.doesNotMatch(await page.locator('#law-insight').textContent(), /Both|two curves/);
          }
          assert.equal(await page.locator('#marginal-bars .marginal-step.reached').count(), step);
          report.fittedMatrix.push({family: fit.familyId, doublings: step, multiplier, dataRemainingPercent: remainingD, parameterRemainingPercent: remainingP});
        }
        for (const [resource, exponent, column] of [['D', fit.dataExponent, 'data-column'], ['P', fit.parameterExponent, 'parameter-column']]) {
          const marginalValues = await page.locator(`#marginal-bars .${column} [data-gap-removed]`).evaluateAll(elements => elements.map(element => Number(element.dataset.gapRemoved)));
          if (exponent === null) {
            assert.deepEqual(marginalValues, []);
            assert.equal(await page.locator('#parameter-exponent-label').textContent(), 'No fitted β');
            continue;
          }
          assert.equal(marginalValues.length, 4);
          const resourcePoints = await page.locator(`#resource-chart circle[data-resource="${resource}"]`).evaluateAll(points => points.map(point => ({step: Number(point.dataset.step), remaining: Number(point.dataset.remaining)})));
          for (const point of resourcePoints) nearly(point.remaining, 100 * (2 ** point.step) ** -exponent, `${resource} fitted point`);
          for (let index = 0; index < 4; index++) {
            const expected = 100 * ((2 ** index) ** -exponent - (2 ** (index + 1)) ** -exponent);
            nearly(marginalValues[index], expected, `${resource} marginal return ${index}`);
            if (index) assert(marginalValues[index] < marginalValues[index - 1], `${resource} successive marginal gains must decline`);
          }
          nearly(marginalValues.reduce((sum, value) => sum + value, 0), 100 * (1 - 16 ** -exponent), `${resource} marginal sum`);
        }
      });
    }

    await check('Eight-row exponent table matches published main-sweep alpha and full-data beta with calculated doubling effects', async () => {
      const rows = await page.locator('#exponent-table tbody tr').evaluateAll(elements => elements.map(row => [...row.children].map(cell => cell.textContent.trim())));
      const expected = data.scalingFits.map(fit => [
        data.families.find(family => family.id === fit.familyId).shortName,
        fit.dataExponent.toFixed(3), `${(100 * (1 - 2 ** -fit.dataExponent)).toFixed(1)}%`,
        fit.parameterExponent === null ? '—' : fit.parameterExponent.toFixed(3),
        fit.parameterExponent === null ? 'Not fitted' : `${(100 * (1 - 2 ** -fit.parameterExponent)).toFixed(1)}%`,
      ]);
      assert.deepEqual(rows, expected);
      assert.equal(await page.locator('#exponent-table th[scope="row"]').count(), 8);
    });

    await check('Both native family selects support keyboard changes and update the relevant charts', async () => {
      await page.locator('#size-family').focus();
      await page.keyboard.press('Home');
      assert.equal(await page.locator('#size-family').inputValue(), 'tabm');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#size-family').inputValue(), 'tabm_mini');
      assert.match(await page.locator('#size-chart-title').textContent(), /TabM-mini/);
      await page.keyboard.press('End');
      assert.equal(await page.locator('#size-family').inputValue(), 'ssl');
      assert.match(await page.locator('#size-chart-title').textContent(), /TokenMoE/);
      await page.locator('#fit-family').focus();
      await page.keyboard.press('Home');
      assert.equal(await page.locator('#fit-family').inputValue(), 'tabm');
      assert.match(await page.locator('#data-exponent-label').textContent(), /0\.309/);
      await page.keyboard.press('End');
      assert.equal(await page.locator('#fit-family').inputValue(), 'glm');
      assert.equal(await page.locator('#resource-chart [data-resource="P"]').count(), 0);
    });

    await check('New downloads and assets resolve, and downloaded CSV contents match the generated files', async () => {
      const resources = ['data/size-scaling-results.csv', 'data/scaling-exponents.csv', 'scaling-explorers.js', 'scaling-explorers.css'];
      const results = [];
      for (const resource of resources) {
        const response = await context.request.get(new URL(resource, origin).href);
        assert(response.ok(), `${resource}: ${response.status()}`);
        assert.equal(await response.text(), fs.readFileSync(path.join(site, resource), 'utf8'));
        if (resource.endsWith('.csv')) assert.equal(await page.locator(`a[download][href="${resource}"]`).count(), 1);
        results.push({resource, status: response.status()});
      }
      return results;
    });

    for (const width of [320, 390, 768, 1440]) {
      await check(`All new controls and opened tables remain within a ${width}px viewport`, async () => {
        const viewportContext = await browser.newContext({viewport: {width, height: 950}, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'reduce'});
        try {
          const responsive = await viewportContext.newPage();
          monitor(responsive, `responsive-${width}`);
          await ready(responsive);
          await responsive.locator('#size-table').evaluate(table => {table.closest('details').open = true;});
          let states = 0;
          for (const group of groups) {
            await responsive.locator('#size-family').selectOption(group);
            for (const axis of ['D', 'P']) {
              await responsive.locator(`[data-size-axis="${axis}"]`).click();
              await noOverflow(responsive);
              states++;
            }
          }
          for (const fit of data.scalingFits) {
            await responsive.locator('#fit-family').selectOption(fit.familyId);
            await noOverflow(responsive);
            states++;
          }
          const dimensions = await noOverflow(responsive);
          return {states, ...dimensions};
        } finally {await viewportContext.close();}
      });
    }

    await check('Standalone file:// supports observed D/P switching, equal-capacity extensions and fitted-law controls', async () => {
      const fileContext = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
      try {
        const filePage = await fileContext.newPage();
        monitor(filePage, 'file-protocol');
        await ready(filePage, pathToFileURL(path.join(site, 'index.html')).href);
        await filePage.locator('#size-family').selectOption('tabm_mini');
        await sliderAt(filePage, '#size-fraction', 5);
        await filePage.locator('#size-extensions').check();
        await observedState(filePage, 'tabm_mini', 'P', 5, true);
        await filePage.locator('[data-size-axis="D"]').click();
        await observedState(filePage, 'tabm_mini', 'D', 5, true);
        await filePage.locator('#fit-family').selectOption('ssl');
        await sliderAt(filePage, '#doublings', 4);
        const fit = data.scalingFits.find(item => item.familyId === 'ssl');
        assert.equal(await filePage.locator('#data-gap-remaining').textContent(), `${(100 * 16 ** -fit.dataExponent).toFixed(1)}%`);
        assert.equal(await filePage.locator('#parameter-gap-remaining').textContent(), `${(100 * 16 ** -fit.parameterExponent).toFixed(1)}%`);
        assert.equal(await filePage.locator('#exponent-table tbody tr').count(), 8);
        const links = await filePage.locator('a[download][href$=".csv"]').evaluateAll(elements => elements.map(element => element.href));
        assert.equal(links.length, 3);
        for (const link of links) assert(fs.existsSync(new URL(link)), link);
      } finally {await fileContext.close();}
    });

    await check('No console errors, uncaught exceptions, failed asset requests or HTTP errors', async () => {
      assert.deepEqual(report.consoleErrors, []);
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.failedRequests, []);
      assert.deepEqual(report.httpErrors, []);
    });
    await context.close();
  } catch (error) {
    report.checks.push({name: 'QA harness setup/execution', status: 'failed', error: error.stack});
    console.error(error.stack);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    report.siteHashesAfter = hashes();
    report.siteChangedDuringRun = JSON.stringify(report.siteHashesBefore) !== JSON.stringify(report.siteHashesAfter);
    report.finishedAt = new Date().toISOString();
    report.summary = {passed: report.checks.filter(check => check.status === 'passed').length, failed: report.checks.filter(check => check.status === 'failed').length, observedStates: report.observedMatrix.length, fittedStates: report.fittedMatrix.length};
    fs.mkdirSync(path.join(root, 'verification'), {recursive: true});
    fs.writeFileSync(path.join(root, 'verification/scaling-qa.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.summary));
    process.exitCode = report.summary.failed ? 1 : 0;
  }
}

run();
