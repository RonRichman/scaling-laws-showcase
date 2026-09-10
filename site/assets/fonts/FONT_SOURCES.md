# Font sources and licenses

The site bundles unmodified TrueType fonts from Google Fonts, served locally with `font-display: swap`. It makes no runtime request to Google Fonts.

Provenance was verified on 9 September 2026. Every bundled font was compared by SHA-256 with a fresh download from its official `fonts.gstatic.com` source below; all six matched exactly. Font name metadata identifies DM Sans version 4.004 and Instrument Serif version 1.000.

## Google Fonts request

[Official stylesheet request](https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap)

The stylesheet was requested with `User-Agent: Mozilla/5.0`, which returned the TrueType resources listed below. The local filenames are deployment filenames; the font software has not been modified.

## Bundled fonts

| Local file | Face | Official source |
|---|---|---|
| `font-0.ttf` | DM Sans 400 normal | [Google Fonts file](https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxhTg.ttf) |
| `font-1.ttf` | DM Sans 500 normal | [Google Fonts file](https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAkJxhTg.ttf) |
| `font-2.ttf` | DM Sans 600 normal | [Google Fonts file](https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAfJthTg.ttf) |
| `font-3.ttf` | DM Sans 700 normal | [Google Fonts file](https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf) |
| `font-4.ttf` | Instrument Serif 400 italic | [Google Fonts file](https://fonts.gstatic.com/s/instrumentserif/v5/jizHRFtNs2ka5fXjeivQ4LroWlx-6zATiw.ttf) |
| `font-5.ttf` | Instrument Serif 400 normal | [Google Fonts file](https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-2zI.ttf) |

## Licenses

Both families are distributed under the SIL Open Font License, version 1.1. Complete upstream license and copyright notices accompany the binaries:

- [DM Sans license](DM-Sans-OFL.txt): Copyright 2014 The DM Sans Project Authors. Retrieved from the [official Google Fonts repository](https://github.com/google/fonts/blob/main/ofl/dmsans/OFL.txt), using its [Contents API](https://api.github.com/repos/google/fonts/contents/ofl/dmsans/OFL.txt?ref=main). Git blob SHA: `4430b85ac62998e2edb914360f9ebdfe43f4deaa`. Upstream project: <https://github.com/googlefonts/dm-fonts>.
- [Instrument Serif license](Instrument-Serif-OFL.txt): Copyright 2022 The Instrument Serif Project Authors. Retrieved from the [official Google Fonts repository](https://github.com/google/fonts/blob/main/ofl/instrumentserif/OFL.txt), using its [Contents API](https://api.github.com/repos/google/fonts/contents/ofl/instrumentserif/OFL.txt?ref=main). Git blob SHA: `669ce7917bec662fcf7244d37f49c4277f6fbd73`. Upstream project: <https://github.com/Instrument/instrument-serif>.

Keep the license files with the distributed font binaries.

## SHA-256 checksums

```text
b0ae3e89a7d3ef2b1838bb4b1ceb0b17cc3435af061eee809d76aa623ff116e9  font-0.ttf
376427b5322148d8de1e03f263bcca4935a2d60ba71d9f94f4947ab664c711ae  font-1.ttf
b79a2ea7a38f33fd96a282fadb9ce97626bb0724a44d21075859f0e50239993a  font-2.ttf
2a8e7f713ee79fbccdef3cef5c787aff47580299f7da60144961e7db2ec08211  font-3.ttf
fecf4861d5202405b8bd45c683858b6870642a026784fe0dbf88ff55dedee8a0  font-4.ttf
a99e3db50076202713812ed541feeb23ffeebb61db1fa6b1cf48fe590d37ef18  font-5.ttf
9af36190332437f5ecd09974de43c1f7c77a310a996cdd8ceb25628b458840e1  DM-Sans-OFL.txt
129ed7618959716959f2941fdd5b49e0ad6e6c1d78726761786a00253d865521  Instrument-Serif-OFL.txt
```
