# Scaling Laws

An interactive research showcase for **Scaling Laws, Tabular Data and Actuarial Ratemaking Models** by Ronald Richman (May 1, 2026).

**Website:** https://ronrichman.github.io/scaling-laws-showcase/

Explore how data, model capacity and computation affect motor claim-frequency prediction: eight model families, 198 model-size scores, three full-data extensions, and interactive illustrations of diminishing returns to data and parameters. The paper, practitioner guide and public-data supplement are included.

## Acknowledgements

The **Casualty Actuarial Society (CAS)** funded this research. We thank **Morgan Bugbee and the CAS project group** for their guidance and insights, and the **anonymous reviewers** for comments that substantially improved the manuscript. We also thank the contributing insurer for the anonymized motor portfolio extract used in the study. These credits follow the [paper's acknowledgements](site/research/scaling-laws-paper.pdf).

## Open locally

Open `site/index.html` directly in your browser, or run:

```bash
python3 -m http.server 4173 --directory site
```

Then visit http://localhost:4173. All fonts, scripts, data and papers are local. There is no build step or runtime package installation.

## Deploy to GitHub Pages

The included workflow validates and publishes only `site/`.

1. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. Open **Actions → Deploy showcase to GitHub Pages → Run workflow**, selecting `main`.
3. The completed deployment provides the website URL.

Publication is manually triggered. After pushing an update, run the workflow again to publish it. Relative asset paths support the repository's project URL and a custom domain. See [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

The downloadable website ZIP contains the contents of `site/` only. To publish that ZIP through **Deploy from a branch**, extract its files to the repository root, keep `.nojekyll`, and choose `main` and `/ (root)` as the publishing source.

## Files

- `site/index.html`: narrative, controls and acknowledgements.
- `site/styles.css` and `site/scaling-explorers.css`: responsive design.
- `site/app.js` and `site/scaling-explorers.js`: interactive charts and architecture diagrams.
- `site/data/`: aggregate scores, parameter counts, fitted exponents and CSV downloads.
- `site/research/`: the paper, guide and supplement, with SHA-256 checksums.
- `scripts/check_site.py`: dependency-free package validation used by deployment.
- `scripts/*qa.cjs`: optional browser and accessibility verification.

## Check changes

```bash
python3 scripts/check_site.py
node --check site/app.js
node --check site/scaling-explorers.js
```

Optional browser checks require Playwright; the accessibility check also requires axe-core. These are development tools and are not shipped with the website. With those packages available to Node, run:

```bash
node scripts/browser-qa.cjs
node scripts/scaling-qa.cjs
node scripts/accessibility-qa.cjs
```

The browser scripts use http://localhost:4173 by default. The scaling suite covers all model-family, data-fraction and fitted-doubling controls. Reports are written under the ignored `verification/` folder.

## Read the results correctly

Scores are Poisson deviance evaluated after averaging predictions from five independently trained seeds. Family curves show the best observed main-sweep configuration at each fraction. Full-data extensions are separate points. The size explorer exposes exact trainable parameters and every selected configuration, including cases where a larger model performs worse.

The fitted D/P lab uses separate, independently normalized descriptive relationships. Its default TabM data exponent is **0.309** and parameter exponent is **0.148**; the extension-inclusive data exponent **0.409** is disclosed separately. Reducing the gap above a fitted floor is not the same as reducing total deviance, premiums or claims. The curves do not establish a joint causal effect of increasing both resources.

TabM-mini xlarge-2 shares its parameter count with the main-sweep xlarge run but uses a separate workflow. Its improvement cannot be attributed to increasing P. The public French MTPL companion is a separate experiment from the anonymized portfolio shown in the main explorer.

Only published aggregate results and research documents are included. Policy-level records, per-policy predictions, checkpoints and source experiment logs are not part of this repository.

## Credits

Research: Ronald Richman. Funding: Casualty Actuarial Society. DM Sans and Instrument Serif are self-hosted under the SIL Open Font License; the font notices are included in `site/assets/fonts/`.
