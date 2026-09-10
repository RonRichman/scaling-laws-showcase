"use strict";

(() => {
  const data = window.SCALING_DATA;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
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
  const shortRows = (value) =>
    value < 1e6
      ? `${Math.round(value / 1000)}k`
      : `${(value / 1e6).toFixed(2)}M`;
  const colors = {
    glm: "#6d786d",
    ffn: "#ad6d27",
    transformer: "#aa7599",
    multicls: "#7953b0",
    hybrid: "#1c8b94",
    moe: "#b7515e",
    ssl: "#927519",
    tabm: "#315cdb",
  };
  const familyById = new Map(
    data.families.map((family) => [family.id, family]),
  );
  const story = ["glm", "transformer", "hybrid", "tabm"];
  let visible = new Set(story);
  let selectedIndex = 5;
  let includeExtensions = false;

  // Navigation works as ordinary anchors, including with JavaScript disabled.
  const menuButton = $(".menu-toggle");
  const nav = $("#main-nav");
  function closeMenu() {
    nav.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.querySelector("span").textContent = "+";
  }
  menuButton.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.querySelector("span").textContent = open ? "−" : "+";
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("open")) {
      closeMenu();
      menuButton.focus();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 600) closeMenu();
  });
  function updateProgress() {
    const available =
      document.documentElement.scrollHeight - window.innerHeight;
    $("#reading-progress").style.width =
      `${available > 0 ? Math.min(100, (window.scrollY / available) * 100) : 0}%`;
  }
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
  updateProgress();

  // A conceptual surface, intentionally separate from the observed result chart.
  const canvas = $("#landscape");
  const context = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let motionPaused = reducedMotion.matches;
  let heroVisible = true;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let phase = 0;
  let frameId = null;
  let lastFrame = 0;
  const motionButton = $("#motion-toggle");
  function point(u, v) {
    const ripple =
      Math.sin(u * 10 + v * 5 + phase) * 0.009 * Math.sin(u * Math.PI);
    return [
      canvasWidth * (0.06 + 0.66 * u + 0.24 * v),
      canvasHeight *
        (0.78 +
          0.025 * u +
          0.1 * v -
          0.59 * Math.exp(-3.5 * u) * (0.4 + 0.6 * (1 - v)) -
          0.06 * (1 - v) +
          ripple),
    ];
  }
  function drawLandscape() {
    if (!context || !canvasWidth) return;
    const w = canvasWidth;
    const h = canvasHeight;
    context.clearRect(0, 0, w, h);
    const glow = context.createRadialGradient(
      w * 0.65,
      h * 0.62,
      0,
      w * 0.65,
      h * 0.62,
      w * 0.49,
    );
    glow.addColorStop(0, "rgba(75,152,152,.07)");
    glow.addColorStop(1, "rgba(75,152,152,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, w, h);
    for (let row = 0; row <= 30; row++) {
      const v = row / 30;
      context.beginPath();
      for (let column = 0; column <= 70; column++) {
        const [x, y] = point(column / 70, v);
        if (!column) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = `rgba(142,217,192,${0.1 + 0.15 * (1 - v)})`;
      context.lineWidth = 0.6;
      context.stroke();
    }
    for (let column = 0; column <= 50; column++) {
      context.beginPath();
      for (let row = 0; row <= 40; row++) {
        const [x, y] = point(column / 50, row / 40);
        if (!row) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = "rgba(115,177,179,.12)";
      context.lineWidth = 0.55;
      context.stroke();
    }
    for (let row = 0; row <= 30; row++) {
      for (let column = 0; column <= 50; column++) {
        const u = column / 50,
          v = row / 30;
        const [x, y] = point(u, v);
        context.beginPath();
        context.arc(x, y, 0.8 + v * 0.33, 0, Math.PI * 2);
        context.fillStyle = `rgba(${Math.round(132 + u * 40)},${Math.round(199 + u * 31)},${Math.round(193 + u * 12)},${0.25 + 0.5 * u})`;
        context.fill();
      }
    }
    context.beginPath();
    for (let column = 0; column <= 100; column++) {
      const [x, y] = point(column / 100, 0.25);
      if (!column) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = "#afe6cc";
    context.lineWidth = 1.55;
    context.stroke();
    for (const u of [0.07, 0.2, 0.4, 0.62, 0.82, 1]) {
      const [x, y] = point(u, 0.25);
      context.beginPath();
      context.arc(x, y, 3.4, 0, Math.PI * 2);
      context.fillStyle = "#c8f1df";
      context.fill();
    }
    context.fillStyle = "#85a7a5";
    context.font = `${w < 400 ? 7 : 9}px Consolas, monospace`;
    context.fillText("MORE TRAINING DATA →", w * 0.49, h * 0.97);
    context.save();
    context.translate(w * 0.025, h * 0.44);
    context.rotate(-Math.PI / 2);
    context.fillText("REDUCIBLE LOSS", 0, 0);
    context.restore();
  }
  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvasWidth = canvas.clientWidth;
    canvasHeight = canvas.clientHeight;
    canvas.width = Math.round(canvasWidth * ratio);
    canvas.height = Math.round(canvasHeight * ratio);
    if (context) context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawLandscape();
  }
  function frame(timestamp) {
    frameId = null;
    if (motionPaused || !heroVisible || document.hidden) return;
    if (timestamp - lastFrame > 45) {
      phase += 0.012;
      drawLandscape();
      lastFrame = timestamp;
    }
    frameId = requestAnimationFrame(frame);
  }
  function scheduleMotion() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    if (!motionPaused && heroVisible && !document.hidden)
      frameId = requestAnimationFrame(frame);
  }
  function updateMotionButton() {
    motionButton.innerHTML = motionPaused
      ? '<span aria-hidden="true">▷</span> Play motion'
      : '<span aria-hidden="true">Ⅱ</span> Pause motion';
    motionButton.setAttribute(
      "aria-label",
      motionPaused ? "Play landscape animation" : "Pause landscape animation",
    );
    motionButton.setAttribute("aria-pressed", String(motionPaused));
  }
  motionButton.addEventListener("click", () => {
    motionPaused = !motionPaused;
    updateMotionButton();
    scheduleMotion();
  });
  reducedMotion.addEventListener("change", (event) => {
    motionPaused = event.matches;
    updateMotionButton();
    scheduleMotion();
  });
  new ResizeObserver(resizeCanvas).observe(canvas);
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    scheduleMotion();
  }).observe(canvas);
  document.addEventListener("visibilitychange", scheduleMotion);
  updateMotionButton();
  resizeCanvas();
  scheduleMotion();

  // Exactly five highlighted cells in a conceptual 100-record diagram.
  $(".claim-grid").innerHTML = Array.from(
    { length: 100 },
    (_, i) =>
      `<i${[6, 28, 43, 71, 95].includes(i) ? ' class="claim"' : ""}></i>`,
  ).join("");

  const toggles = $("#family-toggles");
  function renderToggles() {
    toggles.innerHTML = data.families
      .map(
        (family) =>
          `<button style="--family-color:${colors[family.id]}" data-family="${family.id}" aria-pressed="${visible.has(family.id)}"><i aria-hidden="true"></i>${escape(family.shortName)}</button>`,
      )
      .join("");
  }
  function updateToggleStates() {
    $$("[data-family]").forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(visible.has(button.dataset.family)),
      ),
    );
    $$("[data-preset]").forEach((button) => {
      const active =
        button.dataset.preset === "all"
          ? visible.size === 8
          : visible.size === story.length &&
            story.every((id) => visible.has(id));
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  toggles.addEventListener("click", (event) => {
    const button = event.target.closest("[data-family]");
    if (!button) return;
    const id = button.dataset.family;
    if (visible.has(id)) {
      if (visible.size > 1) visible.delete(id);
    } else visible.add(id);
    updateToggleStates();
    renderChart();
  });
  $$("[data-preset]").forEach((button) =>
    button.addEventListener("click", () => {
      visible = new Set(
        button.dataset.preset === "all"
          ? data.families.map((family) => family.id)
          : story,
      );
      updateToggleStates();
      renderChart();
    }),
  );

  const chart = $("#results-chart");
  const plot = {
    left: 70,
    right: 825,
    top: 25,
    bottom: 339,
    min: 0.2885,
    max: 0.2945,
  };
  const logMin = Math.log(data.trainingRows[0]);
  const logRange = Math.log(data.trainingRows[5]) - logMin;
  const x = (n) =>
    plot.left + ((Math.log(n) - logMin) / logRange) * (plot.right - plot.left);
  const y = (loss) =>
    plot.bottom -
    ((loss - plot.min) / (plot.max - plot.min)) * (plot.bottom - plot.top);
  function renderChart() {
    const compact = window.innerWidth <= 600;
    Object.assign(
      plot,
      compact
        ? { left: 54, right: 432, top: 25, bottom: 277 }
        : { left: 70, right: 825, top: 25, bottom: 339 },
    );
    chart.setAttribute("viewBox", compact ? "0 0 450 325" : "0 0 850 390");
    let svg =
      '<title id="chart-title">Observed insurance model scaling curves</title><desc id="chart-desc">Lower Poisson deviance means better held-out fit. Six nested training fractions, with an accessible numerical table below. Full-data-only extensions appear as separate diamonds when enabled.</desc>';
    for (let tick = 0.289; tick <= 0.29401; tick += 0.001) {
      svg += `<line class="grid-line" x1="${plot.left}" y1="${y(tick)}" x2="${plot.right}" y2="${y(tick)}"/><text x="${plot.left - 15}" y="${y(tick) + 4}" text-anchor="end">${tick.toFixed(3)}</text>`;
    }
    svg += `<line class="axis-line" x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}"/>`;
    data.trainingRows.forEach((n, index) => {
      if (compact && [1, 4].includes(index)) return;
      svg += `<text x="${x(n)}" y="${plot.bottom + 28}" text-anchor="${index === 0 ? "start" : index === 5 ? "end" : "middle"}">${shortRows(n)}</text>`;
    });
    svg += `<line class="selection-line" x1="${x(data.trainingRows[selectedIndex])}" y1="${plot.top}" x2="${x(data.trainingRows[selectedIndex])}" y2="${plot.bottom}"/>`;
    data.families
      .filter((family) => visible.has(family.id))
      .forEach((family) => {
        const color = colors[family.id];
        const path = family.values
          .map(
            (value, index) =>
              `${index ? "L" : "M"}${x(data.trainingRows[index]).toFixed(2)},${y(value).toFixed(2)}`,
          )
          .join(" ");
        svg += `<path class="series-path" d="${path}" stroke="${color}"${family.id === "glm" ? ' stroke-dasharray="6 5"' : ""}/>`;
        family.values.forEach((value, index) => {
          svg += `<circle class="${index === selectedIndex ? "active-point" : "point"}" cx="${x(data.trainingRows[index])}" cy="${y(value)}" r="${index === selectedIndex ? 6 : 4}" fill="${color}"><title>${escape(family.shortName)} · ${data.fractions[index] * 100}%: ${value.toFixed(5)}</title></circle>`;
        });
      });
    if (includeExtensions) {
      data.extensions
        .filter((extension) => visible.has(extension.familyId))
        .forEach((extension) => {
          const px = x(extension.trainingRows),
            py = y(extension.value),
            color = colors[extension.familyId];
          svg += `<path d="M${px} ${py - 6}l6 6-6 6-6-6Z" fill="${color}" stroke="#fffefa" stroke-width="1.5"><title>${escape(extension.name)} · full-data-only: ${extension.value.toFixed(5)}</title></path>`;
        });
    }
    data.trainingRows.forEach((n, index) => {
      const left =
        index === 0
          ? plot.left - 10
          : (x(n) + x(data.trainingRows[index - 1])) / 2;
      const right =
        index === 5
          ? plot.right + 10
          : (x(n) + x(data.trainingRows[index + 1])) / 2;
      svg += `<rect class="chart-hit" data-index="${index}" x="${left}" y="${plot.top}" width="${right - left}" height="${plot.bottom - plot.top}"><title>Select ${data.fractions[index] * 100}% training data · ${n.toLocaleString("en-US")} records</title></rect>`;
    });
    chart.innerHTML = svg;
  }
  function updateReadout() {
    const candidates = data.families.map((family) => ({
      name: family.shortName,
      value: family.values[selectedIndex],
    }));
    if (includeExtensions && selectedIndex === 5)
      data.extensions.forEach((extension) =>
        candidates.push({ name: extension.name, value: extension.value }),
      );
    candidates.sort((a, b) => a.value - b.value);
    $("#selected-rows").textContent = shortRows(
      data.trainingRows[selectedIndex],
    );
    $("#selected-fraction").textContent =
      `${data.fractions[selectedIndex] * 100}% of training data`;
    $("#selected-leader").textContent = candidates[0].name;
    $("#selected-loss").textContent = candidates[0].value.toFixed(5);
    const notes = [
      "The Transformer + TabM hybrid leads at this fraction. The GLM is still a strong baseline.",
      "The hybrid retains the lowest observed ensemble loss as the training set grows.",
      "The hybrid is still ahead. TabM is closing the gap as more data become available.",
      "TabM leads by just 0.00004. This small ensemble gap is not a stable crossover across seeds.",
      "TabM’s advantage widens, with stronger support across the repeated training seeds.",
      includeExtensions
        ? "The largest TabM-mini extension reaches 0.28885, about 1.1% lower deviance than the full-data GLM."
        : "TabM reaches 0.28984 in the main sweep. Enable extensions to see the larger full-data-only models.",
    ];
    $("#selected-note").textContent = notes[selectedIndex];
    $("#fraction-label").textContent =
      `${data.fractions[selectedIndex] * 100}%`;
    $("#data-fraction").value = selectedIndex;
    $("#data-fraction").setAttribute(
      "aria-valuetext",
      `${data.fractions[selectedIndex] * 100} percent, ${data.trainingRows[selectedIndex].toLocaleString("en-US")} training records`,
    );
  }
  function selectFraction(index) {
    selectedIndex = index;
    renderChart();
    updateReadout();
  }
  chart.addEventListener("click", (event) => {
    const hit = event.target.closest("[data-index]");
    if (hit) selectFraction(Number(hit.dataset.index));
  });
  window.addEventListener("resize", renderChart);
  $("#data-fraction").addEventListener("input", (event) =>
    selectFraction(Number(event.target.value)),
  );
  $("#extensions").addEventListener("change", (event) => {
    includeExtensions = event.target.checked;
    renderChart();
    updateReadout();
  });
  function renderTable() {
    const head =
      '<caption>Mean test Poisson deviance of averaged predictions · lower is better</caption><thead><tr><th scope="col">Model family / configuration</th>' +
      data.fractions
        .map((fraction) => `<th scope="col">${fraction * 100}%</th>`)
        .join("") +
      "</tr></thead>";
    const main = data.families
      .map(
        (family) =>
          `<tr><th scope="row">${escape(family.shortName)}</th>${family.values.map((value) => `<td>${value.toFixed(5)}</td>`).join("")}</tr>`,
      )
      .join("");
    const extra = data.extensions
      .map(
        (extension) =>
          `<tr><th scope="row">${escape(extension.name)} · full-data only</th><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>${extension.value.toFixed(5)}</td></tr>`,
      )
      .join("");
    $("#results-table").innerHTML = head + `<tbody>${main}${extra}</tbody>`;
  }
  renderToggles();
  renderChart();
  updateReadout();
  renderTable();

  const architectureContent = {
    glm: {
      eyebrow: "THE ACTUARIAL BASELINE",
      name: "A clear starting point.<br>A strong benchmark.",
      description:
        "The generalized linear model adds together rating-factor effects on a log scale. Earned exposure converts the predicted rate into an expected claim count. Its simplicity makes it a useful reference for every more complex model.",
      finding:
        "The GLM remains stable and competitive, especially with less data. Its curve flattens earlier: the main-sweep data exponent is about 0.091.",
      alt: "GLM: rating factors contribute additive effects to a log rate, which is multiplied by exposure after exponentiation.",
    },
    transformer: {
      eyebrow: "ATTENTION BETWEEN RATING FACTORS",
      name: "Let the features<br>talk to each other.",
      description:
        "A Transformer represents each rating factor as a token. Attention allows those tokens to exchange information, so the model can learn combinations of features. Learned summary tokens collect that information for the final prediction.",
      finding:
        "More parameters give weak returns under the purely supervised recipe. The parameter exponent is about 0.025, compared with 0.148 for TabM.",
      alt: "Transformer: rating-factor tokens exchange information through attention before pooling into a claim-frequency prediction.",
    },
    tabm: {
      eyebrow: "PARAMETER-EFFICIENT ENSEMBLING",
      name: "Many perspectives.<br>One shared backbone.",
      description:
        "TabM packs several neural submodels into one network. They share most of their weights, while small adapters let each member see the input a little differently. Their predictions are averaged. This internal ensemble is separate from the five independently trained seeds.",
      finding:
        "This family shows the strongest main-sweep data scaling (α ≈ 0.309) and the most effective parameter scaling (β ≈ 0.148) among the neural families studied.",
      alt: "TabM: shared weights and member-specific adapters produce several predictions that are averaged into one claim-frequency estimate.",
    },
    ssl: {
      eyebrow: "AN ADDITIONAL LEARNING OBJECTIVE",
      name: "Learn the pattern.<br>Spot what changed.",
      description:
        "During training, selected feature embeddings are swapped with values from other rows in the same minibatch. An auxiliary task asks the model to detect which positions were changed, encouraging it to learn relationships between features. Swaps are disabled at prediction time.",
      finding:
        "The TokenMoE + SSL recipe improves larger Transformer-family results. Width and depth also change, so the study does not isolate the auxiliary loss as the only cause.",
      alt: "Self-supervision: some feature values are replaced with donors from another row, and the model predicts claims while detecting swapped features during training.",
    },
  };
  const line = (x1, y1, x2, y2, extra = "") =>
    `<path class="connector" d="M${x1} ${y1}L${x2} ${y2}" ${extra}/>`;
  function box(x, y, width, height, label, cls = "node") {
    return `<rect class="${cls}" x="${x}" y="${y}" width="${width}" height="${height}" rx="3"/><text x="${x + width / 2}" y="${y + height / 2 + 4}" text-anchor="middle">${escape(label)}</text>`;
  }
  function renderArchitecture(id) {
    const content = architectureContent[id];
    $("#architecture-eyebrow").textContent = content.eyebrow;
    $("#architecture-name").innerHTML = content.name;
    $("#architecture-description").textContent = content.description;
    $("#architecture-finding").textContent = content.finding;
    $("#architecture-panel").setAttribute("aria-labelledby", `tab-${id}`);
    const svg = $("#architecture-svg");
    svg.setAttribute("aria-label", content.alt);
    let graphic = "";
    const inputXs = [42, 226, 410];
    ["Driver age", "Vehicle", "Claims history"].forEach(
      (label, i) => (graphic += box(inputXs[i], 24, 138, 34, label)),
    );
    if (id === "glm") {
      inputXs.forEach((px, i) => {
        graphic += line(px + 69, 58, px + 69, 97);
        graphic += box(
          px + 20,
          97,
          98,
          36,
          ["β₁ × x₁", "β₂ × x₂", "β₃ × x₃"][i],
          "accent",
        );
        graphic += line(px + 69, 133, 295, 182);
      });
      graphic +=
        box(195, 164, 200, 39, "Add the effects", "highlight") +
        line(295, 203, 295, 246) +
        box(157, 246, 276, 38, "Exposure × exp(log rate)");
    } else if (id === "transformer") {
      inputXs.forEach((px) => (graphic += line(px + 69, 58, px + 69, 109)));
      graphic += box(42, 98, 506, 88, "", "accent");
      graphic +=
        '<text x="295" y="128" text-anchor="middle">Attention: feature interactions</text>';
      for (const [start, end] of [
        [110, 295],
        [295, 479],
        [110, 479],
      ])
        graphic += `<path class="connector" d="M${start} 160Q${(start + end) / 2} 126 ${end} 160"/>`;
      [110, 295, 479].forEach(
        (cx) =>
          (graphic += `<circle cx="${cx}" cy="160" r="5" fill="#5277cd"/>`),
      );
      graphic +=
        line(295, 186, 295, 219) +
        box(195, 219, 200, 32, "Learned summary", "highlight") +
        line(295, 251, 295, 280) +
        '<text x="295" y="299" text-anchor="middle">Claim-frequency prediction</text>';
    } else if (id === "tabm") {
      inputXs.forEach((px) => (graphic += line(px + 69, 58, 295, 94)));
      graphic += box(167, 90, 256, 39, "Shared neural weights", "accent");
      [53, 236, 419].forEach((px, i) => {
        graphic +=
          line(295, 129, px + 59, 173) +
          box(px, 164, 118, 37, `Member ${i + 1}`, "highlight");
        graphic += line(px + 59, 201, 295, 248);
      });
      graphic +=
        '<text class="small" x="295" y="154" text-anchor="middle">lightweight individual adapters</text>';
      graphic += box(167, 241, 256, 38, "Average member predictions");
      graphic +=
        '<text class="small" x="295" y="301" text-anchor="middle">Three members shown for illustration</text>';
    } else {
      graphic += line(479, 58, 479, 107, 'stroke-dasharray="4 3"');
      graphic += box(387, 92, 181, 32, "Swapped donor value", "accent");
      graphic +=
        '<text class="small" x="478" y="141" text-anchor="middle">training only</text>';
      graphic +=
        line(111, 58, 235, 175) +
        line(295, 58, 295, 175) +
        line(479, 124, 356, 175);
      graphic += box(165, 164, 260, 42, "TokenMoE + Transformer", "highlight");
      graphic += line(235, 206, 158, 258) + line(355, 206, 442, 258);
      graphic +=
        box(42, 247, 232, 40, "Predict claim frequency") +
        box(322, 247, 232, 40, "Detect swapped features", "accent");
    }
    svg.innerHTML = graphic;
    $$("[data-model]").forEach((button) => {
      const active = button.dataset.model === id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }
  const architectureTabs = $$("[data-model]");
  architectureTabs.forEach((button, index) => {
    button.addEventListener("click", () =>
      renderArchitecture(button.dataset.model),
    );
    button.addEventListener("keydown", (event) => {
      let next = index;
      if (event.key === "ArrowRight")
        next = (index + 1) % architectureTabs.length;
      else if (event.key === "ArrowLeft")
        next = (index + architectureTabs.length - 1) % architectureTabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = architectureTabs.length - 1;
      else return;
      event.preventDefault();
      renderArchitecture(architectureTabs[next].dataset.model);
      architectureTabs[next].focus();
    });
  });
  renderArchitecture("tabm");
  $$(".scope-notes details").forEach((detail) =>
    detail.addEventListener("toggle", () => {
      detail.querySelector("summary span").textContent = detail.open
        ? "−"
        : "＋";
    }),
  );
})();
