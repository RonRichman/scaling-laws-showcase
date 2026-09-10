/* Optional development check: NODE_PATH must resolve playwright and axe-core. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({headless:true});
  const results = [];
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
      await page.goto(process.env.SITE_URL || 'http://localhost:4173/', {waitUntil:'networkidle'});
      await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
      for (const expanded of [false,true]) {
        if (expanded) await page.evaluate(() => document.querySelectorAll('details').forEach(node=>node.open=true));
        const report = await page.evaluate(async () => await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}}));
        results.push({width,expanded,violations:report.violations.map(item=>({id:item.id,impact:item.impact,description:item.description,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})),passes:report.passes.length,incomplete:report.incomplete.map(item=>item.id)});
      }
      await page.close();
    }
    const output = path.resolve(__dirname,'../verification/accessibility-qa.json');
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify({results},null,2));
    const violations=results.reduce((count,result)=>count+result.violations.length,0);
    console.log(JSON.stringify({checks:results.length,violations,results},null,2));
    if(violations) process.exitCode=1;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
