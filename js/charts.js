// Interactive broadsheet SVG charts and semantic lifecycle graphics for Seattle Housing Permits Information

export function fmtNum(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n || 0));
}

export function fmtCompactCurrency(v) {
  if (!v) return "$0";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${fmtNum(v)}`;
}

function niceMax(val) {
  if (val <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(val)));
  const norm = val / pow;
  let step = 1;
  if (norm <= 1.2) step = 1.2;
  else if (norm <= 1.5) step = 1.5;
  else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5;
  else if (norm <= 3) step = 3;
  else if (norm <= 4) step = 4;
  else if (norm <= 5) step = 5;
  else if (norm <= 6) step = 6;
  else if (norm <= 8) step = 8;
  else step = 10;
  return step * pow;
}

export function positionTooltip(tooltipEl, clientX, clientY) {
  const pad = 14;
  const rect = tooltipEl.getBoundingClientRect();
  let left = clientX + pad;
  let top = clientY - rect.height - 10;
  if (left + rect.width > window.innerWidth - pad) {
    left = clientX - rect.width - pad;
  }
  if (top < pad) {
    top = clientY + pad;
  }
  tooltipEl.style.left = `${Math.max(pad, left)}px`;
  tooltipEl.style.top = `${Math.max(pad, top)}px`;
}

export function renderProductionChart({
  container,
  legendEl,
  statEl,
  tooltipEl,
  rows,
  dataset,
  metric,
  dateBasis,
  selectedYear = null,
  onSelectYear = null
}) {
  const W = 980;
  const H = 310;
  const M = { top: 24, right: 24, bottom: 40, left: 64 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const isUnits = metric === "units" && dataset !== "trade";
  const isCost = metric === "cost" && dataset === "building";

  const getPrimary = (r) => {
    if (isUnits) return r.units_added || 0;
    if (isCost) return r.total_cost || 0;
    return r.cnt || 0;
  };

  const histRows = rows.filter((r) => r.yr >= 2016 && r.yr <= 2025);
  const histAvg = histRows.length
    ? histRows.reduce((acc, r) => acc + getPrimary(r), 0) / histRows.length
    : 0;

  const maxVal = niceMax(Math.max(...rows.map(getPrimary), histAvg) * 1.08);
  const barStep = plotW / rows.length;
  const barW = Math.min(42, barStep * 0.62);

  const primaryColor = dataset === "landuse" ? "#234e70" : (dataset === "trade" ? "#38352f" : "#1b4d3e");
  const primaryLabel = isUnits
    ? "Housing units added"
    : isCost
      ? "Estimated project cost"
      : "Total permits";

  legendEl.innerHTML = `
    <span class="legend-item"><span class="swatch" style="background:${primaryColor}"></span>${primaryLabel}</span>
    ${isUnits ? `<span class="legend-item"><span class="swatch swatch-vermilion"></span>Housing units removed</span>` : ""}
    <span class="legend-item"><span class="swatch-dashed"></span>10-yr annual average (2016 to 2025)</span>
  `;

  const ytdRow = rows.find((r) => r.yr === 2026);
  const avgFormatted = isCost ? fmtCompactCurrency(histAvg) : fmtNum(histAvg);
  const ytdVal = ytdRow ? getPrimary(ytdRow) : 0;
  const ytdFormatted = isCost ? fmtCompactCurrency(ytdVal) : fmtNum(ytdVal);
  const pctVsAvg = histAvg > 0 ? Math.round(((ytdVal - histAvg) / histAvg) * 100) : 0;
  const deltaCls = pctVsAvg >= 0 ? "delta-pos" : "delta-neg";
  statEl.innerHTML = `10-yr norm: ${avgFormatted}/yr | 2026 YTD: ${ytdFormatted} <span class="${deltaCls}">(${pctVsAvg >= 0 ? "+" : ""}${pctVsAvg}%)</span>`;

  const ticks = 5;
  let gridSvg = "";
  for (let i = 0; i <= ticks; i++) {
    const val = (maxVal / ticks) * i;
    const y = M.top + plotH - (val / maxVal) * plotH;
    const label = isCost
      ? fmtCompactCurrency(val)
      : val >= 1000
        ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`
        : String(Math.round(val));
    gridSvg += `
      <line x1="${M.left}" y1="${y}" x2="${W - M.right}" y2="${y}" class="chart-grid-line" />
      <text x="${M.left - 10}" y="${y + 4}" text-anchor="end" class="chart-axis-text">${label}</text>
    `;
  }

  const avgY = M.top + plotH - (histAvg / maxVal) * plotH;
  const barsSvg = rows
    .map((r, i) => {
      const val = getPrimary(r);
      const xCenter = M.left + barStep * (i + 0.5);
      const x = xCenter - barW / 2;
      const h = Math.max(2, (val / maxVal) * plotH);
      const y = M.top + plotH - h;
      const isYtd = r.yr === 2026;
      const isSelected = selectedYear === r.yr;
      const barOpacity = selectedYear && !isSelected ? "0.35" : isYtd ? "0.75" : "1";

      let removedSvg = "";
      if (isUnits && r.units_removed > 0) {
        const rh = Math.max(2, (r.units_removed / maxVal) * plotH);
        const ry = M.top + plotH - rh;
        removedSvg = `<rect x="${x + barW * 0.62}" y="${ry}" width="${barW * 0.38}" height="${rh}" fill="#b23225" fill-opacity="${selectedYear && !isSelected ? "0.35" : "1"}" pointer-events="none" />`;
      }

      return `
        <g class="bar-hit" data-index="${i}" tabindex="0" role="button" aria-pressed="${isSelected}" aria-label="${r.yr} ${primaryLabel}: ${isCost ? fmtCompactCurrency(val) : fmtNum(val)}. Click to inspect year details.">
          ${isSelected ? `<rect x="${M.left + barStep * i + 2}" y="${M.top}" width="${barStep - 4}" height="${plotH}" fill="#1b4d3e" fill-opacity="0.09" />` : ""}
          <rect x="${x}" y="${y}" width="${isUnits ? barW * 0.58 : barW}" height="${h}"
            fill="${isYtd && isUnits ? "#b23225" : primaryColor}" fill-opacity="${barOpacity}"
            stroke="${isSelected ? "#171614" : isYtd ? "#171614" : "none"}" stroke-width="${isSelected ? "2" : isYtd ? "1.2" : "0"}"
            stroke-dasharray="${isYtd && !isSelected ? "3,2" : "none"}" class="chart-bar" />
          ${removedSvg}
          <rect x="${M.left + barStep * i}" y="${M.top}" width="${barStep}" height="${plotH}" fill="transparent" style="cursor:pointer" />
          <text x="${xCenter}" y="${H - 12}" text-anchor="middle" class="chart-axis-text" style="${isSelected ? "font-weight:700;fill:#171614" : ""}">${isYtd ? "2026*" : r.yr}</text>
        </g>
      `;
    })
    .join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" aria-label="Historical ${primaryLabel} by ${dateBasis} year from 2014 to 2026">
      ${gridSvg}
      <line x1="${M.left}" y1="${M.top + plotH}" x2="${W - M.right}" y2="${M.top + plotH}" stroke="#171614" stroke-width="1" />
      ${barsSvg}
      <line x1="${M.left}" y1="${avgY}" x2="${W - M.right}" y2="${avgY}" stroke="#171614" stroke-width="1.5" stroke-dasharray="5,4" pointer-events="none" />
      <rect x="${W - M.right - 152}" y="${avgY - 21}" width="152" height="18" fill="#faf7f2" fill-opacity="0.95" pointer-events="none" />
      <text x="${W - M.right - 4}" y="${avgY - 8}" text-anchor="end" class="chart-axis-text" style="font-weight:600;fill:#171614">10-yr norm: ${avgFormatted}</text>
    </svg>
  `;

  container.querySelectorAll(".bar-hit").forEach((g) => {
    g.addEventListener("mousemove", (e) => {
      const r = rows[Number(g.dataset.index)];
      const val = getPrimary(r);
      const diffPct = histAvg > 0 ? Math.round(((val - histAvg) / histAvg) * 100) : 0;
      const net = (r.units_added || 0) - (r.units_removed || 0);
      let rowsHtml = "";
      if (isUnits) {
        rowsHtml = `
          <div class="tooltip-row"><span class="tooltip-muted">Units added</span><strong>${fmtNum(r.units_added)}</strong></div>
          <div class="tooltip-row"><span class="tooltip-muted">Units removed</span><strong>${fmtNum(r.units_removed)}</strong></div>
          <div class="tooltip-row"><span class="tooltip-muted">Net housing units</span><strong>${net >= 0 ? "+" : ""}${fmtNum(net)}</strong></div>
          <div class="tooltip-row"><span class="tooltip-muted">Total permits</span><span>${fmtNum(r.cnt)}</span></div>
        `;
      } else if (isCost) {
        rowsHtml = `
          <div class="tooltip-row"><span class="tooltip-muted">Est. valuation</span><strong>${fmtCompactCurrency(r.total_cost)}</strong></div>
          <div class="tooltip-row"><span class="tooltip-muted">Total permits</span><span>${fmtNum(r.cnt)}</span></div>
          <div class="tooltip-row"><span class="tooltip-muted">Units added</span><span>${fmtNum(r.units_added)}</span></div>
        `;
      } else {
        rowsHtml = `
          <div class="tooltip-row"><span class="tooltip-muted">Permit count</span><strong>${fmtNum(r.cnt)}</strong></div>
          ${r.units_added !== undefined ? `<div class="tooltip-row"><span class="tooltip-muted">Units added</span><span>${fmtNum(r.units_added)}</span></div>` : ""}
        `;
      }

      tooltipEl.innerHTML = `
        <div class="tooltip-title">${r.yr === 2026 ? "2026 (YTD through Nov 23)" : r.yr} (${dateBasis})</div>
        ${rowsHtml}
        <div class="tooltip-row" style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.16)">
          <span class="tooltip-muted">Vs 10-yr norm</span>
          <span class="${diffPct >= 0 ? "tooltip-delta-pos" : "tooltip-delta-neg"}">${diffPct >= 0 ? "+" : ""}${diffPct}%</span>
        </div>
        <div style="margin-top:4px;font-size:11px;color:#b9b2a7">Click bar to inspect year</div>
      `;
      tooltipEl.hidden = false;
      positionTooltip(tooltipEl, e.clientX, e.clientY);
    });

    g.addEventListener("mouseleave", () => {
      tooltipEl.hidden = true;
    });

    const triggerSelect = () => {
      const r = rows[Number(g.dataset.index)];
      if (onSelectYear) onSelectYear(r.yr, histAvg);
    };
    g.addEventListener("click", triggerSelect);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerSelect();
      }
    });
  });
}

export function renderTurnaroundChart({
  container,
  legendEl,
  statEl,
  tooltipEl,
  seriesMap,
  stageLabel,
  showSpread,
  accentColor,
  selectedYear = null,
  onSelectYear = null
}) {
  const years = Object.keys(seriesMap).sort();
  const points = years.map((yr) => ({ yr: Number(yr), ...seriesMap[yr] }));
  const hasP90 = points.some((p) => p.p90 !== undefined);

  const W = 980;
  const H = 310;
  const M = { top: 24, right: 28, bottom: 40, left: 64 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const maxCandidate = Math.max(
    ...points.map((p) => (showSpread ? (p.p90 || p.p75 || p.mean) : p.mean))
  );
  const maxVal = niceMax(maxCandidate * 1.08);

  const histPts = points.filter((p) => p.yr >= 2016 && p.yr <= 2025);
  const histMeanAvg = histPts.reduce((s, p) => s + p.mean, 0) / histPts.length;
  const histMedAvg = histPts.reduce((s, p) => s + p.median, 0) / histPts.length;

  legendEl.innerHTML = `
    <span class="legend-item"><span class="swatch-line" style="background:${accentColor};height:3px"></span>Mean days</span>
    <span class="legend-item"><span class="swatch-line" style="background:#171614;height:2.5px"></span>Median days</span>
    ${showSpread ? `<span class="legend-item"><span class="swatch" style="background:${accentColor};opacity:0.2"></span>${hasP90 ? "75th to 90th percentile band" : "Median to 75th percentile band"}</span>` : ""}
  `;
  const latest = points[points.length - 1];
  const medPct = histMedAvg > 0 ? Math.round(((latest.median - histMedAvg) / histMedAvg) * 100) : 0;
  const medCls = medPct <= 0 ? "delta-pos" : "delta-neg";
  statEl.innerHTML = `10-yr norm: ${histMedAvg.toFixed(0)}d med (${histMeanAvg.toFixed(1)}d mean) | 2026 YTD: ${latest.median}d med <span class="${medCls}">(${medPct >= 0 ? "+" : ""}${medPct}%)</span>`;

  const xAt = (i) => M.left + (plotW / (points.length - 1)) * i;
  const yAt = (v) => M.top + plotH - (v / maxVal) * plotH;

  let gridSvg = "";
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const val = (maxVal / ticks) * i;
    const y = yAt(val);
    gridSvg += `
      <line x1="${M.left}" y1="${y}" x2="${W - M.right}" y2="${y}" class="chart-grid-line" />
      <text x="${M.left - 10}" y="${y + 4}" text-anchor="end" class="chart-axis-text">${Math.round(val)}d</text>
    `;
  }

  let spreadSvg = "";
  if (showSpread) {
    const upper = points.map((p, i) => `${xAt(i)},${yAt(p.p90 || p.p75)}`).join(" ");
    const lower = points
      .slice()
      .reverse()
      .map((p, revIdx) => {
        const i = points.length - 1 - revIdx;
        return `${xAt(i)},${yAt(hasP90 ? p.p75 : p.median)}`;
      })
      .join(" ");
    spreadSvg = `<polygon points="${upper} ${lower}" fill="${accentColor}" fill-opacity="0.13" />`;
  }

  const meanPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.mean)}`).join(" ");
  const medPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.median)}`).join(" ");

  const hitStep = plotW / points.length;
  const dotsAndHits = points
    .map((p, i) => {
      const cx = xAt(i);
      const isYtd = p.yr === 2026;
      const isSel = selectedYear === p.yr;
      return `
        <g class="line-hit" data-index="${i}" tabindex="0" role="button" aria-pressed="${isSel}" aria-label="${p.yr} ${stageLabel}: ${p.median} days median, ${p.mean.toFixed(1)} days mean. Click to inspect.">
          <line x1="${cx}" y1="${M.top}" x2="${cx}" y2="${M.top + plotH}" stroke="${isSel ? accentColor : "transparent"}" stroke-width="${isSel ? "1.5" : "1"}" stroke-dasharray="${isSel ? "3,3" : "none"}" />
          <circle cx="${cx}" cy="${yAt(p.mean)}" r="${isSel ? "6.5" : "4.5"}" fill="${isSel ? accentColor : "#faf7f2"}" stroke="${isSel ? "#171614" : accentColor}" stroke-width="2.5" />
          <circle cx="${cx}" cy="${yAt(p.median)}" r="${isSel ? "5.5" : "4"}" fill="#171614" stroke="#faf7f2" stroke-width="1.5" />
          <rect x="${cx - hitStep / 2}" y="${M.top}" width="${hitStep}" height="${plotH}" fill="transparent" style="cursor:pointer" />
          <text x="${cx}" y="${H - 12}" text-anchor="middle" class="chart-axis-text" style="${isSel ? "font-weight:700;fill:#171614" : ""}">${isYtd ? "2026*" : p.yr}</text>
        </g>
      `;
    })
    .join("");

  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" aria-label="${stageLabel} duration trend 2016 to 2026">
      ${gridSvg}
      <line x1="${M.left}" y1="${M.top + plotH}" x2="${W - M.right}" y2="${M.top + plotH}" stroke="#171614" stroke-width="1" />
      ${spreadSvg}
      <path d="${meanPath}" fill="none" stroke="${accentColor}" stroke-width="2.75" stroke-linejoin="round" />
      <path d="${medPath}" fill="none" stroke="#171614" stroke-width="2.25" stroke-linejoin="round" stroke-dasharray="6,3" />
      ${dotsAndHits}
    </svg>
  `;

  container.querySelectorAll(".line-hit").forEach((g) => {
    g.addEventListener("mousemove", (e) => {
      const p = points[Number(g.dataset.index)];
      tooltipEl.innerHTML = `
        <div class="tooltip-title">${p.yr === 2026 ? "2026 (YTD)" : p.yr}: ${stageLabel}</div>
        <div class="tooltip-row"><span class="tooltip-muted">Median duration</span><strong>${p.median} days</strong></div>
        <div class="tooltip-row"><span class="tooltip-muted">Mean duration</span><strong>${p.mean.toFixed(1)} days</strong></div>
        ${p.p75 !== undefined ? `<div class="tooltip-row"><span class="tooltip-muted">75th percentile</span><span>${p.p75} days</span></div>` : ""}
        ${p.p90 !== undefined ? `<div class="tooltip-row"><span class="tooltip-muted">90th percentile</span><span>${p.p90} days</span></div>` : ""}
        <div class="tooltip-row" style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.16)">
          <span class="tooltip-muted">Sample size</span><span>${fmtNum(p.n)} permits</span>
        </div>
        <div style="margin-top:4px;font-size:11px;color:#b9b2a7">Click point to inspect year</div>
      `;
      tooltipEl.hidden = false;
      positionTooltip(tooltipEl, e.clientX, e.clientY);
    });
    g.addEventListener("mouseleave", () => {
      tooltipEl.hidden = true;
    });
    const triggerSelect = () => {
      const p = points[Number(g.dataset.index)];
      if (onSelectYear) onSelectYear(p.yr);
    };
    g.addEventListener("click", triggerSelect);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerSelect();
      }
    });
  });
}

export function renderClassRangeChart({ container, tooltipEl, classMap, kind, selectedClass = null, onSelectClass = null }) {
  const entries = Object.entries(classMap)
    .map(([name, val]) => {
      const s = kind === "building" ? val.app_to_iss : val;
      return { name, ...s };
    })
    .sort((a, b) => b.mean - a.mean);

  const maxDay = niceMax(Math.max(...entries.map((e) => e.p90 || e.p75 || e.mean)) * 1.06);
  const W = 560;
  const rowH = 44;
  const M = { top: 14, right: 24, bottom: 32, left: 152 };
  const H = M.top + entries.length * rowH + M.bottom;
  const plotW = W - M.left - M.right;
  const xAt = (v) => M.left + (v / maxDay) * plotW;
  const accent = kind === "building" ? "#1b4d3e" : "#234e70";

  let grid = "";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const val = (maxDay / ticks) * i;
    const x = xAt(val);
    grid += `
      <line x1="${x}" y1="${M.top}" x2="${x}" y2="${H - M.bottom}" class="chart-grid-line" />
      <text x="${x}" y="${H - 10}" text-anchor="middle" class="chart-axis-text">${Math.round(val)}d</text>
    `;
  }

  const rowsSvg = entries
    .map((e, i) => {
      const cy = M.top + i * rowH + rowH / 2;
      const upper = e.p90 || e.p75;
      const isSel = selectedClass === e.name;
      return `
        <g class="range-row" data-index="${i}" tabindex="0" role="button" aria-pressed="${isSel}" aria-label="${e.name}: median ${e.median} days, mean ${e.mean.toFixed(1)} days. Click to inspect." style="cursor:pointer">
          <rect x="0" y="${M.top + i * rowH + 2}" width="${W}" height="${rowH - 4}" fill="${isSel ? "#e3eee9" : "transparent"}" rx="2" />
          <text x="${M.left - 12}" y="${cy + 4}" text-anchor="end" style="font-family:'Public Sans',sans-serif;font-size:13px;fill:#171614;font-weight:${isSel ? "700" : "500"}">${e.name}</text>
          <line x1="${xAt(e.median)}" y1="${cy}" x2="${xAt(upper)}" y2="${cy}" stroke="${accent}" stroke-width="${isSel ? "7" : "5"}" stroke-opacity="0.24" stroke-linecap="round" />
          ${e.p75 && e.p90 ? `<line x1="${xAt(e.median)}" y1="${cy}" x2="${xAt(e.p75)}" y2="${cy}" stroke="${accent}" stroke-width="${isSel ? "7" : "5"}" stroke-opacity="0.50" stroke-linecap="round" />` : ""}
          <circle cx="${xAt(e.median)}" cy="${cy}" r="${isSel ? "6" : "5"}" fill="#171614" />
          <rect x="${xAt(e.mean) - 4.5}" y="${cy - 4.5}" width="9" height="9" fill="${accent}" stroke="#faf7f2" stroke-width="1.5" transform="rotate(45 ${xAt(e.mean)} ${cy})" />
          <text x="${xAt(upper) + 7}" y="${cy + 4}" class="chart-axis-text" style="font-size:11.5px;font-weight:${isSel ? "700" : "400"}">${e.mean.toFixed(0)}d</text>
        </g>
      `;
    })
    .join("");

  container.innerHTML = `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:13px;color:var(--ink-muted);margin-bottom:0.5rem">
      <span class="legend-item"><span class="swatch" style="background:#171614;border-radius:50%"></span>Median</span>
      <span class="legend-item"><span class="swatch" style="background:${accent};transform:rotate(45deg);width:8px;height:8px"></span>Mean</span>
      <span class="legend-item"><span class="swatch" style="background:${accent};opacity:0.35;width:16px;height:6px"></span>Range to ${kind === "building" ? "90th" : "75th"} pct</span>
    </div>
    <div class="chart-canvas-wrap">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" aria-label="Permit turnaround days by permit class">
        ${grid}
        ${rowsSvg}
      </svg>
    </div>
  `;

  container.querySelectorAll(".range-row").forEach((g) => {
    g.addEventListener("mousemove", (e) => {
      const item = entries[Number(g.dataset.index)];
      tooltipEl.innerHTML = `
        <div class="tooltip-title">${item.name} (${kind === "building" ? "Building" : "Land Use MUP"})</div>
        <div class="tooltip-row"><span class="tooltip-muted">Median</span><strong>${item.median} days</strong></div>
        <div class="tooltip-row"><span class="tooltip-muted">Mean</span><strong>${item.mean.toFixed(1)} days</strong></div>
        ${item.p75 ? `<div class="tooltip-row"><span class="tooltip-muted">75th percentile</span><span>${item.p75} days</span></div>` : ""}
        ${item.p90 ? `<div class="tooltip-row"><span class="tooltip-muted">90th percentile</span><span>${item.p90} days</span></div>` : ""}
        <div class="tooltip-row"><span class="tooltip-muted">Issued sample</span><span>${fmtNum(item.n)} permits</span></div>
        <div style="margin-top:4px;font-size:11px;color:#b9b2a7">Click row for full breakdown</div>
      `;
      tooltipEl.hidden = false;
      positionTooltip(tooltipEl, e.clientX, e.clientY);
    });
    g.addEventListener("mouseleave", () => {
      tooltipEl.hidden = true;
    });
    const triggerSelect = () => {
      const item = entries[Number(g.dataset.index)];
      if (onSelectClass) onSelectClass(item.name);
    };
    g.addEventListener("click", triggerSelect);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        triggerSelect();
      }
    });
  });
}

export function renderMultifamilyJourney(container, data) {
  const lu = data.landUsePermits.reviewTimes.appToIssuedByClass["Multifamily"];
  const bp = data.buildingPermits.processingTimes.byClass["Multifamily"];
  const stages = [
    {
      label: "1. Land Use Master Use Permit (Applied to Issued)",
      median: lu.median,
      mean: lu.mean,
      color: "#234e70"
    },
    {
      label: "2. Building Permit Plan Review (Applied to Issued)",
      median: bp.app_to_iss.median,
      mean: bp.app_to_iss.mean,
      color: "#96520e"
    },
    {
      label: "3. Active Construction (Issued to Completed)",
      median: bp.iss_to_comp.median,
      mean: bp.iss_to_comp.mean,
      color: "#1b4d3e"
    }
  ];

  const maxStage = Math.max(...stages.map((s) => s.mean)) * 1.05;
  const totalMedian = stages.reduce((s, x) => s + x.median, 0);
  const totalMean = stages.reduce((s, x) => s + x.mean, 0);

  container.innerHTML =
    stages
      .map(
        (s) => `
      <div class="journey-item">
        <div class="journey-head">
          <span class="journey-title">${s.label}</span>
          <span class="journey-nums"><strong>${s.median}d</strong> med / ${s.mean.toFixed(0)}d mean</span>
        </div>
        <div class="journey-bar-bg">
          <div class="journey-bar-mean" style="width:${(s.mean / maxStage) * 100}%;background:${s.color}"></div>
          <div class="journey-bar-median" style="width:${(s.median / maxStage) * 100}%;background:${s.color}"></div>
        </div>
      </div>
    `
      )
      .join("") +
    `
    <div class="journey-total-box">
      <div class="journey-total-label">Sequential sum across all 3 stages</div>
      <div class="journey-total-val">${totalMedian}d median (${(totalMedian / 365).toFixed(1)} yrs)</div>
    </div>
    <div style="font-size:13px;color:var(--ink-muted);display:flex;justify-content:space-between;margin-top:-0.5rem">
      <span>Mean sequential total</span>
      <strong class="mono">${Math.round(totalMean)} days (${(totalMean / 365).toFixed(1)} yrs)</strong>
    </div>
  `;
}

// Responsive semantic HTML 4-stage lifecycle (consistent Multifamily cohort, crisp at all mobile widths)
export function renderPermitLifecycleGraphic(container, data) {
  const luMf = data.landUsePermits.reviewTimes.appToIssuedByClass["Multifamily"];
  const bpMf = data.buildingPermits.processingTimes.byClass["Multifamily"];
  const issuedStat = data.buildingPermits.byStatus.find((s) => s.status === "Issued") || { units_added: 0 };
  const phaseStat = data.buildingPermits.byStatus.find((s) => s.status === "Phase Issued") || { units_added: 0 };
  const authorizedUnits = issuedStat.units_added + phaseStat.units_added;

  const steps = [
    {
      name: "1. Land Use (MUP)",
      desc: "Zoning, design review, SEPA, and lot entitlement.",
      metric: `Multifamily: ${luMf.median}d med (${Math.round(luMf.mean)}d avg)`,
      color: "var(--marine)"
    },
    {
      name: "2. Building Plan Review",
      desc: "Structural, energy, fire code review and correction cycles.",
      metric: `Multifamily: ${bpMf.app_to_iss.median}d med (${Math.round(bpMf.app_to_iss.mean)}d avg)`,
      color: "var(--ochre)"
    },
    {
      name: "3. Issuance & Trade Permits",
      desc: "Permit issued alongside mechanical, electrical, and plumbing.",
      metric: `${fmtNum(authorizedUnits)} units authorized citywide`,
      color: "var(--pine)"
    },
    {
      name: "4. Construction & Occupancy",
      desc: "Site build-out, inspections, and certificate of occupancy.",
      metric: `Multifamily: ${bpMf.iss_to_comp.median}d med (${Math.round(bpMf.iss_to_comp.mean)}d avg)`,
      color: "var(--ink)"
    }
  ];

  container.innerHTML = steps
    .map(
      (s) => `
      <div class="lifecycle-step">
        <div class="lifecycle-stage-name">${s.name}</div>
        <div class="lifecycle-stage-desc">${s.desc}</div>
        <div class="lifecycle-stage-metric" style="color:${s.color}">${s.metric}</div>
      </div>
    `
    )
    .join("");
}
