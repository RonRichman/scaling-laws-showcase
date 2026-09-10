"use strict";

(() => {
  const research = window.SCALING_DATA;
  const $ = (selector) => document.querySelector(selector);
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const compactNumber = (value) =>
    value >= 1e6
      ? `${(value / 1e6).toFixed(2)}M`
      : value >= 1000
        ? `${(value / 1000).toFixed(value < 1e5 ? 1 : 0)}k`
        : String(Math.round(value));
  const integer = (value) => value.toLocaleString("en-US");
  const modelColors = ["#287d83", "#95713b", "#6c5ba0", "#315cdb", "#ad5068"];
  const dColor = "#a6eacb";
  const pColor = "#efb786";

  // The same GLM specification, evaluated over two observed data intervals.
  const glm = research.families.find((family) => family.id === "glm");
  const earlyRows = research.trainingRows[1] - research.trainingRows[0];
  const lateRows = research.trainingRows[5] - research.trainingRows[3];
  const earlyGain = glm.values[0] - glm.values[1];
  const lateGain = glm.values[3] - glm.values[5];
  const earlyUnit = (earlyGain / earlyRows) * 1e6;
  const lateUnit = (lateGain / lateRows) * 1e6;
  $("#early-added").textContent = integer(earlyRows);
  $("#late-added").textContent = integer(lateRows);
  $("#early-gain").textContent = earlyGain.toFixed(6);
  $("#late-gain").textContent = lateGain.toFixed(6);
  $("#early-unit").textContent = earlyUnit.toFixed(6);
  $("#late-unit").textContent = lateUnit.toFixed(6);
  $("#late-return-bar").style.width = `${(lateUnit / earlyUnit) * 100}%`;
  $("#return-ratio").textContent = (earlyUnit / lateUnit).toFixed(0);
  $("#return-ratio-copy").textContent = (earlyUnit / lateUnit).toFixed(0);

  const groupNames = {
    tabm: "TabM",
    tabm_mini: "TabM-mini",
    ffn: "Feed-forward network",
    transformer: "Vanilla Transformer",
    multicls: "MultiCLS Transformer",
    hybrid: "Transformer + TabM",
    moe: "TokenMoE",
    ssl: "TokenMoE + SSL",
  };
  function groupModels(group) {
    if (group === "tabm")
      return research.sizeLadders.tabm.filter(
        (model) => !model.configuration.startsWith("tabm_mini_"),
      );
    if (group === "tabm_mini")
      return research.sizeLadders.tabm.filter((model) =>
        model.configuration.startsWith("tabm_mini_"),
      );
    return research.sizeLadders[group];
  }
  function groupExtensions(group) {
    if (group === "tabm_mini")
      return research.extensions.filter((model) => model.familyId === "tabm");
    if (group === "ssl")
      return research.extensions.filter((model) => model.familyId === "ssl");
    return [];
  }
  const shortSize = (name) =>
    (name.match(/\(([^)]+)\)/)?.[1] || name).replace(/_/g, " ");
  let sizeGroup = "tabm";
  let sizeAxis = "P";
  let fractionIndex = 0;
  let extensionRequested = false;
  const allModels = Object.values(research.sizeLadders).flat();
  $("#size-score-count").textContent = allModels.reduce(
    (count, model) =>
      count + model.values.filter((value) => value !== null).length,
    0,
  );
  $("#size-config-count").textContent = allModels.length;

  function renderSizeExplorer() {
    const models = groupModels(sizeGroup);
    const availableExtensions = groupExtensions(sizeGroup);
    const extensionAvailable =
      fractionIndex === 5 && availableExtensions.length > 0;
    const extensions =
      extensionRequested && extensionAvailable ? availableExtensions : [];
    $("#capacity-workflow-note").hidden = sizeGroup !== "tabm_mini";
    $("#size-extensions").disabled = !extensionAvailable;
    $("#size-extension-help").textContent =
      availableExtensions.length === 0
        ? "Choose TabM-mini or TokenMoE + SSL"
        : fractionIndex !== 5
          ? "Move the training data to 100% to enable"
          : "Separate runs tested only at full data";
    $("#size-fraction-label").textContent =
      `${research.fractions[fractionIndex] * 100}% · ${integer(research.trainingRows[fractionIndex])} rows`;
    $("#size-fraction").value = fractionIndex;
    $("#size-fraction").setAttribute(
      "aria-valuetext",
      `${research.fractions[fractionIndex] * 100} percent, ${integer(research.trainingRows[fractionIndex])} training rows`,
    );
    $("#size-guide-copy").textContent =
      sizeAxis === "P"
        ? "Hold the training data fixed. Compare the actual loss at each tested parameter count."
        : "Follow each fixed model configuration as the training set grows. The dashed line marks the selected data size.";
    $("#size-axis-label").textContent =
      sizeAxis === "P"
        ? "TRAINABLE PARAMETERS P · LOGARITHMIC SCALE"
        : "TRAINING POLICY-PERIOD ROWS D · LOGARITHMIC SCALE";
    $("#size-legend").innerHTML =
      models
        .map(
          (model, index) =>
            `<span><i style="background:${modelColors[index]}" aria-hidden="true"></i>${escape(shortSize(model.name))}<small>${compactNumber(model.parameterCounts[fractionIndex])} P</small></span>`,
        )
        .join("") +
      (extensions.length
        ? '<span class="extension-legend">◇ full-data-only</span>'
        : "");

    const compact = window.innerWidth <= 600;
    const width = compact ? 450 : 800;
    const height = compact ? 345 : 380;
    const left = compact ? 57 : 71;
    const right = width - 24;
    const top = 27;
    const bottom = height - 52;
    // Keep loss bounds constant across D within each family, even when extensions are hidden.
    const allLosses = models
      .flatMap((model) => model.values)
      .concat(availableExtensions.map((model) => model.value));
    const low = Math.floor((Math.min(...allLosses) - 0.00025) * 1000) / 1000;
    const high = Math.ceil((Math.max(...allLosses) + 0.00025) * 1000) / 1000;
    const y = (loss) => bottom - ((loss - low) / (high - low)) * (bottom - top);
    const observedX =
      sizeAxis === "D"
        ? research.trainingRows
        : models
            .map((model) => model.parameterCounts[fractionIndex])
            .concat(extensions.map((model) => model.parameterCount));
    const xmin = Math.min(...observedX),
      xmax = Math.max(...observedX);
    const x = (value) =>
      left +
      ((Math.log(value) - Math.log(xmin)) / (Math.log(xmax) - Math.log(xmin))) *
        (right - left);
    let drawing = `<title id="size-chart-title">${escape(groupNames[sizeGroup])}: observed ${sizeAxis === "P" ? "parameter" : "data"} scaling</title><desc id="size-chart-description">${models.length} fixed configurations. All results use averaged predictions from five training seeds. The numerical table follows the chart.</desc>`;
    for (let i = 0; i <= 4; i++) {
      const value = low + ((high - low) * i) / 4;
      drawing += `<line class="size-grid-line" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/><text class="plot-tick" x="${left - 12}" y="${y(value) + 4}" text-anchor="end">${value.toFixed(3)}</text>`;
    }
    drawing += `<line class="size-grid-line" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}"/>`;
    const distinctTicks = [...new Set(observedX)].sort((a, b) => a - b);
    let previousPosition = -Infinity;
    distinctTicks.forEach((value, index) => {
      const px = x(value),
        last = index === distinctTicks.length - 1;
      if (
        index > 0 &&
        !last &&
        (px - previousPosition < (compact ? 76 : 66) || right - px < 60)
      )
        return;
      previousPosition = px;
      drawing += `<text class="plot-tick" x="${px}" y="${bottom + 27}" text-anchor="${index === 0 ? "start" : last ? "end" : "middle"}">${compactNumber(value)}</text>`;
    });
    if (sizeAxis === "P") {
      const sortedModels = models
        .map((model, index) => ({ model, index }))
        .sort(
          (a, b) =>
            a.model.parameterCounts[fractionIndex] -
            b.model.parameterCounts[fractionIndex],
        );
      drawing += `<path class="observed-size-line" d="${sortedModels.map(({ model }, index) => `${index ? "L" : "M"}${x(model.parameterCounts[fractionIndex])},${y(model.values[fractionIndex])}`).join(" ")}"/>`;
      sortedModels.forEach(({ model, index }) => {
        drawing += `<circle class="size-point" data-config="${escape(model.configuration)}" data-loss="${model.values[fractionIndex]}" data-parameters="${model.parameterCounts[fractionIndex]}" cx="${x(model.parameterCounts[fractionIndex])}" cy="${y(model.values[fractionIndex])}" r="6" fill="${modelColors[index]}"><title>${escape(model.name)}: ${integer(model.parameterCounts[fractionIndex])} trainable parameters; test deviance ${model.values[fractionIndex].toFixed(6)}</title></circle>`;
      });
    } else {
      drawing += `<line class="size-selection" x1="${x(research.trainingRows[fractionIndex])}" x2="${x(research.trainingRows[fractionIndex])}" y1="${top}" y2="${bottom}"/>`;
      models.forEach((model, index) => {
        drawing += `<path class="observed-size-line" stroke="${modelColors[index]}" d="${model.values.map((loss, i) => `${i ? "L" : "M"}${x(research.trainingRows[i])},${y(loss)}`).join(" ")}"/>`;
        model.values.forEach((loss, i) => {
          drawing += `<circle class="size-point" data-config="${escape(model.configuration)}" data-loss="${loss}" data-fraction="${i}" cx="${x(research.trainingRows[i])}" cy="${y(loss)}" r="${i === fractionIndex ? 6 : 3.5}" fill="${modelColors[index]}"><title>${escape(model.name)} at ${research.fractions[i] * 100}% data: ${loss.toFixed(6)}</title></circle>`;
        });
      });
    }
    extensions.forEach((model) => {
      const px = x(
          sizeAxis === "P" ? model.parameterCount : model.trainingRows,
        ),
        py = y(model.value);
      drawing += `<path class="size-extension" data-config="${escape(model.configuration)}" data-loss="${model.value}" d="M${px} ${py - 7}l7 7-7 7-7-7Z"><title>${escape(model.name)}, full-data-only: ${model.value.toFixed(6)}</title></path>`;
    });
    const chart = $("#size-chart");
    chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    chart.innerHTML = drawing;

    const ranked = models
      .map((model) => ({
        name: model.name,
        parameters: model.parameterCounts[fractionIndex],
        loss: model.values[fractionIndex],
      }))
      .concat(
        extensions.map((model) => ({
          name: model.name,
          parameters: model.parameterCount,
          loss: model.value,
        })),
      )
      .sort((a, b) => a.loss - b.loss);
    $("#size-winner").textContent = ranked[0].name;
    $("#size-best-loss").textContent = ranked[0].loss.toFixed(5);
    $("#size-winner-params").textContent =
      `${integer(ranked[0].parameters)} trainable parameters`;
    const bySize = ranked.slice().sort((a, b) => a.parameters - b.parameters);
    const smallest = bySize[0],
      largest = bySize[bySize.length - 1];
    const gain = smallest.loss - largest.loss;
    $("#size-change").innerHTML =
      `<strong>${(largest.parameters / smallest.parameters).toFixed(1)}×</strong> the parameters<br><strong class="${gain >= 0 ? "gain-good" : "gain-bad"}">${Math.abs(gain).toFixed(6)} ${gain >= 0 ? "lower" : "higher"}</strong> deviance`;
    $("#size-interpretation").textContent =
      gain < 0
        ? "At this data size, the largest configuration fits the test set worse than the smallest. Extra capacity has not paid off."
        : ranked[0].parameters < largest.parameters
          ? "The largest model improves on the smallest, but an intermediate size has the lowest observed loss."
          : "The largest plotted model has the lowest observed loss here. Compare the steps: gains need not be equal or monotone.";
    renderSizeTable(models, availableExtensions);
  }

  function renderSizeTable(models, extensions) {
    const head =
      '<caption>Selected family: exact trainable parameters at full data and all six ensemble scores</caption><thead><tr><th scope="col">Configuration</th><th scope="col">P at 100%</th>' +
      research.fractions
        .map((f) => `<th scope="col">${f * 100}%</th>`)
        .join("") +
      "</tr></thead>";
    const rows = models
      .map(
        (model) =>
          `<tr><th scope="row">${escape(model.name)}</th><td>${integer(model.parameterCounts[5])}</td>${model.values.map((loss) => `<td>${loss.toFixed(6)}</td>`).join("")}</tr>`,
      )
      .join("");
    const extra = extensions
      .map(
        (model) =>
          `<tr><th scope="row">${escape(model.name)} · full-data only</th><td>${integer(model.parameterCount)}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>${model.value.toFixed(6)}</td></tr>`,
      )
      .join("");
    $("#size-table").innerHTML = head + `<tbody>${rows}${extra}</tbody>`;
  }
  $("#size-family").addEventListener("change", (event) => {
    sizeGroup = event.target.value;
    renderSizeExplorer();
  });
  $("#size-fraction").addEventListener("input", (event) => {
    fractionIndex = Number(event.target.value);
    renderSizeExplorer();
  });
  $("#size-extensions").addEventListener("change", (event) => {
    extensionRequested = event.target.checked;
    renderSizeExplorer();
  });
  function selectAxis(axis) {
    sizeAxis = axis;
    document.querySelectorAll("[data-size-axis]").forEach((button) => {
      const active = button.dataset.sizeAxis === axis;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("active", active);
    });
  }
  document.querySelectorAll("[data-size-axis]").forEach((button) =>
    button.addEventListener("click", () => {
      selectAxis(button.dataset.sizeAxis);
      renderSizeExplorer();
    }),
  );
  document.querySelectorAll("[data-size-story]").forEach((button) =>
    button.addEventListener("click", () => {
      const story = button.dataset.sizeStory;
      sizeGroup = story === "transformer" ? "transformer" : "tabm";
      fractionIndex = story === "reversal" ? 0 : 5;
      $("#size-family").value = sizeGroup;
      selectAxis("P");
      renderSizeExplorer();
      $(".size-explorer").scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      $("#size-family").focus({ preventScroll: true });
    }),
  );

  let fitFamily = "tabm";
  function renderResourceLab() {
    const fit = research.scalingFits.find((row) => row.familyId === fitFamily);
    const family = research.families.find((row) => row.id === fitFamily);
    const step = Number($("#doublings").value);
    const multiplier = 2 ** step;
    const dataRemaining = 100 * multiplier ** -fit.dataExponent;
    const parameterRemaining =
      fit.parameterExponent === null
        ? null
        : 100 * multiplier ** -fit.parameterExponent;
    $("#data-gap-remaining").innerHTML =
      `${dataRemaining.toFixed(1)}<span>%</span>`;
    $("#parameter-gap-remaining").innerHTML =
      parameterRemaining === null
        ? "—"
        : `${parameterRemaining.toFixed(1)}<span>%</span>`;
    $("#parameter-gap-description").textContent =
      parameterRemaining === null
        ? "No model-size sweep for this fixed GLM specification"
        : "of the starting gap remains";
    $("#data-exponent-label").textContent =
      `α = ${fit.dataExponent.toFixed(3)} · data-envelope fit`;
    $("#parameter-exponent-label").textContent =
      fit.parameterExponent === null
        ? "No fitted β"
        : `β = ${fit.parameterExponent.toFixed(3)} · full-data Pareto fit`;
    $("#data-multiplier").textContent = `${multiplier}×`;
    $("#parameter-legend").hidden = parameterRemaining === null;
    $("#doublings").setAttribute(
      "aria-valuetext",
      `${multiplier} times the resource: data curve ${dataRemaining.toFixed(1)} percent remaining${parameterRemaining === null ? "" : `, parameter curve ${parameterRemaining.toFixed(1)} percent remaining`}`,
    );
    $("#law-insight").textContent =
      step === 0
        ? parameterRemaining === null
          ? "The data curve starts with 100% of its initial gap. No parameter-scaling fit is available for this GLM specification."
          : "Both fitted curves start with the same normalized loss gap. Move the slider to see how each resource’s returns accumulate."
        : `${family.shortName}: ${multiplier}× the data removes ${(100 - dataRemaining).toFixed(1)}% of the original reducible-loss gap.${parameterRemaining === null ? " No parameter-scaling fit is available for the GLM." : ` The separate parameter fit removes ${(100 - parameterRemaining).toFixed(1)}% at ${multiplier}× the parameters.`}`;

    const compact = window.innerWidth <= 600;
    const width = compact ? 450 : 760,
      height = 330,
      left = 48,
      right = width - 20,
      top = 25,
      bottom = 282;
    const x = (exponent) => left + (exponent / 4) * (right - left),
      y = (percent) => bottom - (percent / 100) * (bottom - top);
    let drawing =
      parameterRemaining === null
        ? '<title id="resource-chart-title">Fitted diminishing returns to data</title><desc id="resource-chart-description">The GLM data curve is normalized to 100 percent initial reducible loss. No parameter-scaling fit is available for this specification.</desc>'
        : '<title id="resource-chart-title">Fitted diminishing returns to D and P</title><desc id="resource-chart-description">The two curves are independently normalized to 100 percent initial reducible loss. They use separate data and parameter exponents from the research.</desc>';
    for (const percent of [0, 25, 50, 75, 100])
      drawing += `<line class="resource-grid-line" x1="${left}" x2="${right}" y1="${y(percent)}" y2="${y(percent)}"/><text class="plot-tick" x="${left - 10}" y="${y(percent) + 4}" text-anchor="end">${percent}%</text>`;
    for (let i = 0; i <= 4; i++)
      drawing += `<text class="plot-tick" x="${x(i)}" y="${bottom + 28}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${2 ** i}×</text>`;
    drawing += `<line class="resource-selection" x1="${x(step)}" x2="${x(step)}" y1="${top}" y2="${bottom}"/>`;
    for (const resource of [
      { id: "D", value: fit.dataExponent, color: dColor },
      { id: "P", value: fit.parameterExponent, color: pColor },
    ]) {
      if (resource.value === null) continue;
      const path = Array.from({ length: 81 }, (_, index) => {
        const e = index / 20;
        return `${index ? "L" : "M"}${x(e)},${y(100 * (2 ** e) ** -resource.value)}`;
      }).join(" ");
      drawing += `<path class="fitted-resource-line" data-resource="${resource.id}" d="${path}" stroke="${resource.color}"${resource.id === "P" ? ' stroke-dasharray="7 5"' : ""}/>`;
      for (let i = 0; i <= 4; i++)
        drawing += `<circle class="fitted-resource-point" data-resource="${resource.id}" data-step="${i}" data-remaining="${100 * (2 ** i) ** -resource.value}" cx="${x(i)}" cy="${y(100 * (2 ** i) ** -resource.value)}" r="${i === step ? 6 : 3.5}" fill="${resource.color}"><title>${resource.id} at ${2 ** i}×: ${(100 * (2 ** i) ** -resource.value).toFixed(1)}% of initial gap remaining</title></circle>`;
    }
    $("#resource-chart").setAttribute("viewBox", `0 0 ${width} ${height}`);
    $("#resource-chart").innerHTML = drawing;
    const marginal = [];
    let bars = "";
    for (let i = 1; i <= 4; i++) {
      const d =
        100 *
        ((2 ** (i - 1)) ** -fit.dataExponent - (2 ** i) ** -fit.dataExponent);
      const p =
        fit.parameterExponent === null
          ? null
          : 100 *
            ((2 ** (i - 1)) ** -fit.parameterExponent -
              (2 ** i) ** -fit.parameterExponent);
      marginal.push(
        `${2 ** (i - 1)} to ${2 ** i} times: data removes ${d.toFixed(1)} percentage points${p === null ? "" : `, parameters remove ${p.toFixed(1)}`}`,
      );
      bars += `<div class="marginal-step${i <= step ? " reached" : ""}"><span>${2 ** (i - 1)}× → ${2 ** i}×</span><div class="marginal-pair"><div class="marginal-column data-column"><strong>${d.toFixed(1)}<small>pp</small></strong><i style="height:${Math.max(3, (d / 22) * 90)}px" data-gap-removed="${d}" aria-hidden="true"></i><span>D</span></div><div class="marginal-column parameter-column"><strong>${p === null ? "—" : p.toFixed(1)}${p === null ? "" : "<small>pp</small>"}</strong><i style="height:${p === null ? 0 : Math.max(3, (p / 22) * 90)}px"${p === null ? "" : ` data-gap-removed="${p}"`} aria-hidden="true"></i><span>P</span></div></div></div>`;
    }
    $("#marginal-bars").innerHTML = bars;
    $("#marginal-bars").setAttribute(
      "aria-label",
      `Percentage points of the original gap removed at successive doublings. ${marginal.join(". ")}`,
    );
  }

  function renderExponents() {
    const heading =
      '<caption>Data exponents use the main sweep; parameter exponents use full-data Pareto points</caption><thead><tr><th scope="col">Model family</th><th scope="col">α · D</th><th scope="col">Gap removed by 2× D</th><th scope="col">β · P</th><th scope="col">Gap removed by 2× P</th></tr></thead>';
    const rows = research.scalingFits
      .map((fit) => {
        const family = research.families.find(
          (item) => item.id === fit.familyId,
        );
        const d = 100 * (1 - 2 ** -fit.dataExponent),
          p =
            fit.parameterExponent === null
              ? null
              : 100 * (1 - 2 ** -fit.parameterExponent);
        return `<tr><th scope="row">${escape(family.shortName)}</th><td>${fit.dataExponent.toFixed(3)}</td><td><div class="exponent-value data-value"><i style="width:${(d / 20) * 95}%" aria-hidden="true"></i><span>${d.toFixed(1)}%</span></div></td><td>${fit.parameterExponent === null ? "—" : fit.parameterExponent.toFixed(3)}</td><td>${p === null ? "Not fitted" : `<div class="exponent-value parameter-value"><i style="width:${(p / 20) * 95}%" aria-hidden="true"></i><span>${p.toFixed(1)}%</span></div>`}</td></tr>`;
      })
      .join("");
    $("#exponent-table").innerHTML = heading + `<tbody>${rows}</tbody>`;
  }
  $("#fit-family").addEventListener("change", (event) => {
    fitFamily = event.target.value;
    renderResourceLab();
  });
  $("#doublings").addEventListener("input", renderResourceLab);
  window.addEventListener("resize", () => {
    renderSizeExplorer();
    renderResourceLab();
  });
  renderSizeExplorer();
  renderResourceLab();
  renderExponents();
})();
