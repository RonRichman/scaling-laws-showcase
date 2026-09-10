#!/usr/bin/env python3
"""Check the deployable static package without optional dependencies."""

from __future__ import annotations

import csv
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


class Document(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.urls: list[str] = []
        self.headings: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.append(attributes["id"])
        for key in ("href", "src"):
            if attributes.get(key):
                self.urls.append(attributes[key])
        if tag == "h1":
            self.headings.append(tag)


def main() -> None:
    document = Document()
    document.feed((SITE / "index.html").read_text())
    assert len(document.ids) == len(set(document.ids)), "Duplicate element IDs"
    assert len(document.headings) == 1, "Expected one primary heading"
    checked_links = 0
    for url in document.urls:
        parsed = urlsplit(url)
        if parsed.scheme or parsed.netloc:
            continue
        assert not parsed.path.startswith("/"), f"Root-relative URL breaks project hosting: {url}"
        target = SITE / unquote(parsed.path) if parsed.path else SITE / "index.html"
        assert target.is_file(), f"Missing linked file: {url}"
        if parsed.fragment and not parsed.path:
            assert parsed.fragment in document.ids, f"Missing anchor: {url}"
        checked_links += 1

    for stylesheet in SITE.rglob("*.css"):
        for url in re.findall(r"url\(['\"]?([^)'\"]+)", stylesheet.read_text()):
            assert not url.startswith(("http:", "https:", "/")), f"Non-local stylesheet asset: {url}"
            assert (stylesheet.parent / url).is_file(), f"Missing stylesheet asset: {url}"

    data = json.loads((SITE / "data/research.json").read_text())
    assert len(data["families"]) == 8 and len(data["fractions"]) == 6
    assert data["trainingRows"][-1] == 4_034_782
    assert len(data["extensions"]) == 3
    tabm = next(family for family in data["families"] if family["id"] == "tabm")
    assert round(tabm["values"][-1], 5) == 0.28984
    assert round(tabm["bestAchievedValues"][-1], 5) == 0.28885
    assert data["fit"]["alpha"] == 0.409
    assert data["fit"]["mainSweepAlpha"] == 0.309
    ladders = [model for models in data["sizeLadders"].values() for model in models]
    assert len(ladders) == 33
    assert all(len(model["values"]) == len(model["parameterCounts"]) == 6 for model in ladders)
    expected_scores = {
        (model["configuration"], fraction): (model["values"][index], model["parameterCounts"][index])
        for model in ladders
        for index, fraction in enumerate(data["fractions"])
    }
    expected_scores.update({
        (model["configuration"], 1.0): (model["value"], model["parameterCount"])
        for model in data["extensions"]
    })
    with (SITE / "data/size-scaling-results.csv").open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    exported_scores = {
        (row["configuration"], float(row["training_fraction"])):
        (float(row["test_poisson_deviance"]), int(row["parameters_trainable"]))
        for row in rows
    }
    assert len(rows) == 201 and exported_scores == expected_scores, "Model-size export differs from browser data"
    fits = {row["familyId"]: row for row in data["scalingFits"]}
    assert len(fits) == 8 and fits["glm"]["parameterExponent"] is None
    assert fits["tabm"]["dataExponent"] == 0.309 and fits["tabm"]["parameterExponent"] == 0.148
    with (SITE / "data/scaling-exponents.csv").open(newline="") as stream:
        exponent_rows = list(csv.DictReader(stream))
    assert len(exponent_rows) == 8
    for row in exponent_rows:
        fit = fits[row["family_id"]]
        assert float(row["data_exponent_main_sweep"]) == fit["dataExponent"]
        parameter = row["parameter_exponent_full_data_pareto"]
        assert (float(parameter) if parameter else None) == fit["parameterExponent"]
    browser_data = (SITE / "data/research.js").read_text()
    match = re.search(r"window\.SCALING_DATA\s*=\s*([\s\S]+);\s*$", browser_data)
    assert match and json.loads(match.group(1)) == data, "Browser and JSON data differ"

    for line in (SITE / "research/SHA256SUMS").read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        digest, filename = line.split(maxsplit=1)
        path = SITE / "research" / filename.lstrip("*")
        assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, f"Research checksum mismatch: {filename}"

    for family in ("DM-Sans", "Instrument-Serif"):
        assert "SIL OPEN FONT LICENSE" in (SITE / f"assets/fonts/{family}-OFL.txt").read_text()
    assert (SITE / ".nojekyll").is_file()
    for path in SITE.rglob("*"):
        assert not path.is_symlink(), f"A hosted artifact must be self-contained: {path}"
        if path.suffix in {".html", ".js", ".json", ".css", ".csv"}:
            content = path.read_text()
            assert not re.search(r"/(?:home/[^/\s]+|mnt/[a-z])/|sk-proj-|BEGIN PRIVATE KEY", content), f"Private material in {path}"
    print(f"PASS: {checked_links} local links/anchors, local fonts, 8 families, 51 comparison scores, 201 size/extension scores, 8 exponent pairs, research checksums and standalone package boundaries.")


if __name__ == "__main__":
    main()
