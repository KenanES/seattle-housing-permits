import { SEATTLE_SNAPSHOT } from "../data/seattle-snapshot.js";
import { refreshLiveSeattleData, fetchPermitsForYear, fetchPermitByNum } from "./api.js";
import {
  fmtNum,
  fmtCompactCurrency,
  renderProductionChart,
  renderTurnaroundChart,
  renderClassRangeChart,
  renderMultifamilyJourney,
  renderPermitLifecycleGraphic
} from "./charts.js";
import { renderSeattleMap } from "./map.js";

let appData = structuredClone(SEATTLE_SNAPSHOT);
let lastFocusedBeforeDrawer = null;

const state = {
  prodDataset: "building",
  prodMetric: "units",
  prodDateBasis: "issued",
  selectedProdYear: null,
  timeStage: "bp_app_iss",
  timeShowSpread: true,
  selectedTimeYear: null,
  classTimeKind: "building",
  selectedClassName: null,
  pipelineKind: "building",
  pipelinePhase: "all",
  projectSearch: "",
  projectSort: "units_desc",
  excludeDemo: true,
  mapStatusFilter: "all",
  selectedZip: null
};

const tooltipEl = document.getElementById("chart-tooltip");

function getReferenceDateStr() {
  const iso = appData.meta?.fetchedAt || new Date().toISOString();
  return iso.slice(0, 10);
}

function setGroupActive(container, attr, value) {
  container.querySelectorAll("button").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset[attr] === value));
  });
}

function getStatusStyle(status) {
  if (status === "Issued" || status === "Phase Issued") return "status-issued";
  if (status === "Ready for Issuance" || status === "Reviews Completed" || status === "Approved to Occupy") {
    return "status-ready";
  }
  return "status-review";
}

// Group SDCI active statuses into 4 clean human-readable phases
function classifyPipelinePhase(status) {
  if (status === "Issued" || status === "Phase Issued") return "construction";
  if (status === "Ready for Issuance" || status === "Reviews Completed" || status === "Approved to Occupy" || status === "Inspections Completed" || status === "Ready for Publication" || status === "Published") {
    return "ready";
  }
  if (status === "Corrections Required" || status === "Additional Info Requested" || status === "Awaiting Information" || status === "Corrections Submitted") {
    return "corrections";
  }
  return "intake";
}

function daysBetween(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const a = Date.parse(startStr);
  const b = Date.parse(endStr);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000);
}

function renderKPIs() {
  const bpStatus = appData.buildingPermits.byStatus;
  const findStat = (name) => bpStatus.find((s) => s.status === name) || { cnt: 0, units_added: 0, units_removed: 0 };

  const issued = findStat("Issued");
  const phaseIssued = findStat("Phase Issued");
  const unitsUnderConstruction = issued.units_added + phaseIssued.units_added;
  const permitsUnderConstruction = issued.cnt + phaseIssued.cnt;

  const reviewStatuses = [
    "Additional Info Requested", "Corrections Required", "Reviews In Process",
    "Scheduled", "Ready for Issuance", "Application Completed",
    "Awaiting Information", "Reviews Completed", "Ready for Intake",
    "Corrections Submitted", "Initiated", "Scheduled and Submitted"
  ];
  const unitsInReview = reviewStatuses.reduce((sum, st) => sum + findStat(st).units_added, 0);

  document.getElementById("kpi-units-issued").textContent = fmtNum(unitsUnderConstruction);
  document.getElementById("kpi-units-issued-sub").textContent =
    `Gross units across ${fmtNum(permitsUnderConstruction)} issued and phased building permits, plus ${fmtNum(unitsInReview)} units in active review.`;

  const bp2026 = appData.buildingPermits.processingTimes.byYear["2026"].app_to_iss;
  const bp2024 = appData.buildingPermits.processingTimes.byYear["2024"].app_to_iss;
  const bpPeakPct = Math.round(((bp2026.mean - bp2024.mean) / bp2024.mean) * 100);
  const bpPeakCls = bpPeakPct <= 0 ? "delta-pos" : "delta-neg";
  const bpMf = appData.buildingPermits.processingTimes.byClass["Multifamily"].app_to_iss;
  document.getElementById("kpi-bp-days").textContent = `${bp2026.median} days`;
  document.getElementById("kpi-bp-days-sub").innerHTML =
    `2026 YTD median (${bp2026.mean.toFixed(1)}d mean, <span class="${bpPeakCls}">${bpPeakPct >= 0 ? "+" : ""}${bpPeakPct}% vs 2024 peak</span>). Multifamily: ${bpMf.median}d med.`;

  const luByYear = appData.landUsePermits.reviewTimes.appToIssuedByYear;
  const lu2026 = luByYear["2026"];
  const luHistMeds = Object.entries(luByYear)
    .filter(([yr]) => Number(yr) >= 2016 && Number(yr) <= 2025)
    .map(([, v]) => v.median);
  const luMedAvg = luHistMeds.reduce((s, v) => s + v, 0) / luHistMeds.length;
  const luMedPct = Math.round(((lu2026.median - luMedAvg) / luMedAvg) * 100);
  const luMedCls = luMedPct <= 0 ? "delta-pos" : "delta-neg";
  const luMf = appData.landUsePermits.reviewTimes.appToIssuedByClass["Multifamily"];
  document.getElementById("kpi-lu-days").textContent = `${lu2026.median} days`;
  document.getElementById("kpi-lu-days-sub").innerHTML =
    `2026 YTD median (<span class="${luMedCls}">${luMedPct >= 0 ? "+" : ""}${luMedPct}% vs 10-yr norm</span>). Multifamily MUPs: ${luMf.median}d med (${luMf.mean.toFixed(0)}d avg).`;

  const bpIssuedYrs = appData.buildingPermits.byIssuedYear;
  const hist10 = bpIssuedYrs.filter((r) => r.yr >= 2016 && r.yr <= 2025);
  const avg10 = hist10.reduce((s, r) => s + r.units_added, 0) / hist10.length;
  const ytd26 = bpIssuedYrs.find((r) => r.yr === 2026)?.units_added || 0;
  const pct = Math.round(((ytd26 - avg10) / avg10) * 100);
  const pctCls = pct >= 0 ? "delta-pos" : "delta-neg";
  document.getElementById("kpi-ytd-velocity").textContent = fmtNum(ytd26);
  document.getElementById("kpi-ytd-velocity-sub").innerHTML =
    `Issued YTD compared with ${fmtNum(avg10)} ten-year annual average (2016 to 2025), <span class="${pctCls}">${pct >= 0 ? "+" : ""}${pct}%</span>.`;
}

function renderTypologyTimelines() {
  const bpClass = appData.buildingPermits.processingTimes.byClass;
  const luClass = appData.landUsePermits.reviewTimes.appToIssuedByClass;

  const sf = bpClass["Single Family/Duplex"];
  const sfLu = luClass["Single Family/Duplex"];
  const mf = bpClass["Multifamily"];
  const mfLu = luClass["Multifamily"];
  const biz = bpClass["Commercial"];
  const bizLu = luClass["Commercial"];
  const ind = bpClass["Industrial"];

  const maxScale = 540;

  // Consistent horizontal bar order across all 3 columns: Building review -> Land Use MUP -> Construction
  const items = [
    {
      title: "Single Family Home Standalone + Townhomes",
      sample: `n = ${fmtNum(sf.app_to_iss.n)} issued permits`,
      rows: [
        { label: "Building review", med: sf.app_to_iss.median, mean: sf.app_to_iss.mean, color: "#1b4d3e" },
        { label: "Land Use MUP (if subdivision)", med: sfLu.median, mean: sfLu.mean, color: "#234e70" },
        { label: "Construction", med: sf.iss_to_comp.median, mean: sf.iss_to_comp.mean, color: "#171614" }
      ],
      note: "Standalone homes, remodels, and pre-approved DADUs clear fastest; townhome unit-lot subdivisions add land use review."
    },
    {
      title: "Multifamily Home / Apartment buildings",
      sample: `n = ${fmtNum(mf.app_to_iss.n)} issued permits`,
      rows: [
        { label: "Building review", med: mf.app_to_iss.median, mean: mf.app_to_iss.mean, color: "#1b4d3e" },
        { label: "Land Use MUP (when required)", med: mfLu.median, mean: mfLu.mean, color: "#234e70" },
        { label: "Construction", med: mf.iss_to_comp.median, mean: mf.iss_to_comp.mean, color: "#171614" }
      ],
      note: "Typical end-to-end timeline is roughly 2.4 years median (MUP entitlement and building plan review often overlap partially)."
    },
    {
      title: "Business buildings",
      sample: `n = ${fmtNum(biz.app_to_iss.n)} commercial + ${fmtNum(ind.app_to_iss.n)} industrial`,
      rows: [
        { label: "Building review", med: biz.app_to_iss.median, mean: biz.app_to_iss.mean, color: "#1b4d3e" },
        { label: "Land Use MUP (new ground-up)", med: bizLu.median, mean: bizLu.mean, color: "#234e70" },
        { label: "Build-out / construction", med: biz.iss_to_comp.median, mean: biz.iss_to_comp.mean, color: "#171614" }
      ],
      note: `Commercial tenant build-outs clear fast (${biz.app_to_iss.median}d median); industrial projects average ${ind.app_to_iss.mean.toFixed(0)}d review (${ind.app_to_iss.median}d median).`
    }
  ];

  document.getElementById("typology-timelines-grid").innerHTML = items
    .map(
      (item) => `
      <article class="typology-col">
        <div>
          <h3 class="typology-title">${item.title}</h3>
          <div class="typology-sample">${item.sample}</div>
        </div>
        <div class="typology-metrics">
          ${item.rows
            .map(
              (r) => `
            <div class="typology-row">
              <div class="typology-row-top">
                <span class="typology-stage-name">${r.label}</span>
                <span class="typology-stage-val"><strong>${r.med}d</strong> med (${r.mean.toFixed(0)}d avg)</span>
              </div>
              <div class="typology-bar-track">
                <div class="typology-bar-mean" style="width:${Math.min(100, (r.mean / maxScale) * 100)}%;background:${r.color}"></div>
                <div class="typology-bar-med" style="width:${Math.min(100, (r.med / maxScale) * 100)}%;background:${r.color}"></div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
        <p class="typology-note">${item.note}</p>
      </article>
    `
    )
    .join("");
}

function renderProductionSection() {
  const metricTabs = document.getElementById("prod-metric-tabs");
  const unitsBtn = metricTabs.querySelector('[data-metric="units"]');
  const costBtn = metricTabs.querySelector('[data-metric="cost"]');

  if (state.prodDataset === "trade") {
    unitsBtn.disabled = true;
    unitsBtn.title = "Trade permits track mechanical, electrical, and plumbing counts rather than housing units.";
    costBtn.disabled = true;
    costBtn.title = "Estimated construction valuation is reported on building permits.";
    unitsBtn.style.opacity = "0.42";
    costBtn.style.opacity = "0.42";
    if (state.prodMetric !== "count") {
      state.prodMetric = "count";
      setGroupActive(metricTabs, "metric", "count");
    }
  } else if (state.prodDataset === "landuse") {
    unitsBtn.disabled = false;
    unitsBtn.title = "";
    unitsBtn.style.opacity = "1";
    costBtn.disabled = true;
    costBtn.title = "Estimated construction valuation is reported on building permits.";
    costBtn.style.opacity = "0.42";
    if (state.prodMetric === "cost") {
      state.prodMetric = "units";
      setGroupActive(metricTabs, "metric", "units");
    }
  } else {
    unitsBtn.disabled = false;
    costBtn.disabled = false;
    unitsBtn.title = "";
    costBtn.title = "";
    unitsBtn.style.opacity = "1";
    costBtn.style.opacity = "1";
  }

  let rows;
  if (state.prodDataset === "building") {
    rows = state.prodDateBasis === "issued"
      ? appData.buildingPermits.byIssuedYear
      : appData.buildingPermits.byAppliedYear;
  } else if (state.prodDataset === "landuse") {
    rows = state.prodDateBasis === "issued"
      ? appData.landUsePermits.byIssuedYear
      : appData.landUsePermits.byAppliedYear;
  } else {
    rows = state.prodDateBasis === "issued"
      ? appData.tradePermits.byIssuedYear
      : appData.tradePermits.byAppliedYear;
  }

  document.querySelectorAll("#dataset-glossary .glossary-item").forEach((el) => {
    const active = el.dataset.dataset === state.prodDataset;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });

  renderProductionChart({
    container: document.getElementById("prod-chart-container"),
    legendEl: document.getElementById("prod-chart-legend"),
    statEl: document.getElementById("prod-chart-stat"),
    tooltipEl,
    rows,
    dataset: state.prodDataset,
    metric: state.prodMetric,
    dateBasis: state.prodDateBasis,
    selectedYear: state.selectedProdYear,
    onSelectYear: (yr) => {
      state.selectedProdYear = state.selectedProdYear === yr ? null : yr;
      renderProductionSection();
    }
  });

  renderProdYearDetail(rows);
}

function renderProdYearDetail(rows) {
  const panel = document.getElementById("prod-year-detail");
  if (!state.selectedProdYear) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }

  const r = rows.find((x) => x.yr === state.selectedProdYear);
  if (!r) {
    panel.hidden = true;
    return;
  }

  const isTrade = state.prodDataset === "trade";
  const isCost = state.prodMetric === "cost" && state.prodDataset === "building";
  const isUnits = state.prodMetric === "units" && !isTrade;
  const getVal = (row) => (isUnits ? row.units_added || 0 : isCost ? row.total_cost || 0 : row.cnt || 0);
  const hist = rows.filter((x) => x.yr >= 2016 && x.yr <= 2025);
  const histAvg = hist.reduce((s, x) => s + getVal(x), 0) / hist.length;
  const diffPct = histAvg > 0 ? Math.round(((getVal(r) - histAvg) / histAvg) * 100) : 0;
  const diffCls = diffPct >= 0 ? "delta-pos" : "delta-neg";
  const net = (r.units_added || 0) - (r.units_removed || 0);
  const dsLabel = state.prodDataset === "building" ? "Building permits" : state.prodDataset === "landuse" ? "Land use MUPs" : "Trade permits";

  panel.hidden = false;
  panel.innerHTML = `
    <div class="detail-panel-head">
      <h3 class="detail-panel-title">${r.yr === 2026 ? "2026 (YTD through Nov 23)" : r.yr}: ${dsLabel} (${state.prodDateBasis})</h3>
      <div class="detail-panel-actions">
        <button type="button" class="btn-primary" id="fetch-year-live-btn">Load top ${r.yr} permits from data.seattle.gov</button>
        <button type="button" class="btn-secondary" id="clear-prod-year-btn">Clear</button>
      </div>
    </div>
    <div class="detail-metrics-row">
      <div><div class="detail-metric-k">Total permits</div><div class="detail-metric-v">${fmtNum(r.cnt)}</div></div>
      ${!isTrade ? `<div><div class="detail-metric-k">Housing units added</div><div class="detail-metric-v">${fmtNum(r.units_added)}</div></div>` : ""}
      ${!isTrade ? `<div><div class="detail-metric-k">Net housing units</div><div class="detail-metric-v"><span class="${net >= 0 ? "delta-pos" : "delta-neg"}">${net >= 0 ? "+" : ""}${fmtNum(net)}</span></div></div>` : ""}
      ${r.total_cost ? `<div><div class="detail-metric-k">Est. valuation</div><div class="detail-metric-v">${fmtCompactCurrency(r.total_cost)}</div></div>` : ""}
      <div><div class="detail-metric-k">Vs 10-yr norm</div><div class="detail-metric-v"><span class="${diffCls}">${diffPct >= 0 ? "+" : ""}${diffPct}%</span></div></div>
    </div>
    <div class="detail-live-list" id="prod-year-live-list" hidden></div>
  `;

  document.getElementById("clear-prod-year-btn").addEventListener("click", () => {
    state.selectedProdYear = null;
    renderProductionSection();
  });

  const liveBtn = document.getElementById("fetch-year-live-btn");
  liveBtn.addEventListener("click", async () => {
    const out = document.getElementById("prod-year-live-list");
    let token = "";
    try { token = localStorage.getItem("seattle_socrata_token") || ""; } catch {}
    liveBtn.disabled = true;
    liveBtn.textContent = `Loading ${r.yr} permits...`;
    out.hidden = false;
    out.innerHTML = `<div style="font-size:0.84rem;color:var(--ink-muted)">Querying live ${r.yr} records from data.seattle.gov...</div>`;
    try {
      const list = await fetchPermitsForYear({
        dataset: state.prodDataset,
        year: r.yr,
        dateBasis: state.prodDateBasis,
        token
      });
      if (!list.length) {
        out.innerHTML = `<div style="font-size:0.84rem;color:var(--ink-muted)">No matching housing records returned for ${r.yr}.</div>`;
      } else {
        out.innerHTML = `
          <div style="font-size:0.84rem;color:var(--ink-muted);margin-bottom:0.55rem">Top ${list.length} live records from ${r.yr} (select any address to inspect full permit details):</div>
          <div class="table-wrap">
            <table class="data-table compact-table projects-table">
              <thead>
                <tr>
                  <th scope="col">Address and permit</th>
                  <th scope="col">Class</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="num">Units</th>
                  <th scope="col" class="num">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                ${list
                  .map(
                    (p, idx) => `
                  <tr>
                    <td>
                      <button type="button" class="row-trigger-btn" data-y-idx="${idx}">
                        <span class="cell-primary">${p.originaladdress1}</span>
                        <span class="cell-secondary">${p.permitnum} (${p.applieddate || p.issueddate})</span>
                      </button>
                    </td>
                    <td>${p.permitclass}</td>
                    <td><span class="status-cell ${getStatusStyle(p.statuscurrent)}">${p.statuscurrent}</span></td>
                    <td class="num">${p.housingunitsadded ? `+${fmtNum(p.housingunitsadded)}` : "0"}</td>
                    <td class="num">${p.estprojectcost ? fmtCompactCurrency(p.estprojectcost) : "Not listed"}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `;
        out.querySelectorAll("button[data-y-idx]").forEach((btn) => {
          btn.addEventListener("click", () => openDrawer(list[Number(btn.dataset.yIdx)], btn));
        });
      }
    } catch (err) {
      out.innerHTML = `<div style="font-size:0.84rem;color:var(--vermilion)">Could not load live ${r.yr} permits. Check your connection or try again from the Live Feed page.</div>`;
    } finally {
      liveBtn.disabled = false;
      liveBtn.textContent = `Load top ${r.yr} permits from data.seattle.gov`;
    }
  });
}

function renderHistoricalBenchmarks() {
  const calc = (rows, key, formatter = fmtNum) => {
    const h = rows.filter((r) => r.yr >= 2016 && r.yr <= 2025);
    const avg = h.reduce((s, r) => s + (r[key] || 0), 0) / h.length;
    const peak = rows.reduce((best, r) => ((r[key] || 0) > (best[key] || 0) ? r : best), rows[0]);
    const r25 = rows.find((r) => r.yr === 2025);
    const r26 = rows.find((r) => r.yr === 2026);
    const v25 = r25 ? r25[key] : 0;
    const v26 = r26 ? r26[key] : 0;
    const pct25 = avg > 0 ? Math.round(((v25 - avg) / avg) * 100) : 0;
    const pct26 = avg > 0 ? Math.round(((v26 - avg) / avg) * 100) : 0;
    return {
      avg: formatter(avg),
      peak: `${formatter(peak[key])} (${peak.yr})`,
      y25: formatter(v25),
      pct25,
      y26: formatter(v26),
      pct26
    };
  };

  const items = [
    { label: "Housing units issued (Building)", ...calc(appData.buildingPermits.byIssuedYear, "units_added") },
    { label: "Housing units applied (Building)", ...calc(appData.buildingPermits.byAppliedYear, "units_added") },
    { label: "Building permits issued", ...calc(appData.buildingPermits.byIssuedYear, "cnt") },
    { label: "Building valuation issued", ...calc(appData.buildingPermits.byIssuedYear, "total_cost", fmtCompactCurrency) },
    { label: "Land Use MUP units applied", ...calc(appData.landUsePermits.byAppliedYear, "units_added") },
    { label: "Trade permits issued", ...calc(appData.tradePermits.byIssuedYear, "cnt") }
  ];

  const fmtDeltaSpan = (p) =>
    `<span class="delta-sub ${p >= 0 ? "delta-pos" : "delta-neg"}">${p >= 0 ? "+" : ""}${p}% vs avg</span>`;

  document.getElementById("historical-benchmarks-body").innerHTML = items
    .map(
      (it) => `
      <tr>
        <td class="cell-primary">${it.label}</td>
        <td class="num">${it.avg}</td>
        <td class="num">${it.peak}</td>
        <td class="num">${it.y25}${fmtDeltaSpan(it.pct25)}</td>
        <td class="num">${it.y26}${fmtDeltaSpan(it.pct26)}</td>
      </tr>
    `
    )
    .join("");

  const housingCategoryDefinitions = {
    "Large Multifamily": "Mid-rise and high-rise apartment, condominium, and mixed-use residential buildings with larger unit counts.",
    "Middle Housing": "Townhomes, duplexes, triplexes, fourplexes, stacked flats, and cottage housing between single-family homes and large apartments.",
    "Single-Family Add/Alt": "Additions, interior remodels, basement conversions, and attached accessory dwelling units (ADUs) on single-family lots.",
    "Commercial Add/Alt": "Tenant improvements, structural remodels, and residential-over-retail conversions inside commercial buildings.",
    "Pre-Approved DADU Plans": "Detached backyard cottages (detached accessory dwelling units) built using SDCI's fast-track pre-reviewed plan library.",
    "Multifamily (Other)": "Live-work conversions, congregate residences, boarding houses, and specialized multifamily alterations."
  };

  const cats = appData.buildingPermits.byHousingCategory2020
    .filter((c) => c.category !== "Unclassified / Legacy Tag")
    .sort((a, b) => b.units_added - a.units_added);
  const maxUnits = Math.max(...cats.map((c) => c.units_added), 1);

  document.getElementById("housing-category-bars").innerHTML = cats
    .map(
      (c) => `
      <div class="bar-row">
        <div class="bar-row-top">
          <span class="bar-row-label">${c.category}</span>
          <span class="bar-row-meta"><strong>${fmtNum(c.units_added)}</strong> units (${fmtNum(c.cnt)} permits)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${Math.max(2, (c.units_added / maxUnits) * 100)}%"></div>
        </div>
        <p class="bar-row-def">${housingCategoryDefinitions[c.category] || "SDCI building permit housing classification."}</p>
      </div>
    `
    )
    .join("");
}

function renderTurnaroundSection() {
  const stageConfig = {
    bp_app_iss: {
      label: "Building permit review (Applied to Issued)",
      color: "#1b4d3e",
      map: Object.fromEntries(
        Object.entries(appData.buildingPermits.processingTimes.byYear).map(([yr, v]) => [yr, v.app_to_iss])
      )
    },
    bp_iss_comp: {
      label: "Building construction (Issued to Completed)",
      color: "#1b4d3e",
      map: Object.fromEntries(
        Object.entries(appData.buildingPermits.processingTimes.byYear).map(([yr, v]) => [yr, v.iss_to_comp])
      )
    },
    lu_app_dec: {
      label: "Land Use review (Applied to Decision)",
      color: "#234e70",
      map: appData.landUsePermits.reviewTimes.appToDecisionByYear
    },
    lu_app_iss: {
      label: "Land Use MUP (Applied to Issued)",
      color: "#234e70",
      map: appData.landUsePermits.reviewTimes.appToIssuedByYear
    }
  };

  const cfg = stageConfig[state.timeStage];
  renderPermitLifecycleGraphic(document.getElementById("permit-lifecycle-graphic"), appData);

  renderTurnaroundChart({
    container: document.getElementById("time-chart-container"),
    legendEl: document.getElementById("time-chart-legend"),
    statEl: document.getElementById("time-chart-stat"),
    tooltipEl,
    seriesMap: cfg.map,
    stageLabel: cfg.label,
    showSpread: state.timeShowSpread,
    accentColor: cfg.color,
    selectedYear: state.selectedTimeYear,
    onSelectYear: (yr) => {
      state.selectedTimeYear = state.selectedTimeYear === yr ? null : yr;
      renderTurnaroundSection();
    }
  });

  renderTimeYearDetail(stageConfig);

  renderClassRangeChart({
    container: document.getElementById("class-range-chart"),
    tooltipEl,
    classMap:
      state.classTimeKind === "building"
        ? appData.buildingPermits.processingTimes.byClass
        : appData.landUsePermits.reviewTimes.appToIssuedByClass,
    kind: state.classTimeKind,
    selectedClass: state.selectedClassName,
    onSelectClass: (clsName) => {
      state.selectedClassName = state.selectedClassName === clsName ? null : clsName;
      renderTurnaroundSection();
    }
  });

  renderClassDetail();
  renderMultifamilyJourney(document.getElementById("multifamily-journey"), appData);
}

function renderTimeYearDetail(stageConfig) {
  const panel = document.getElementById("time-year-detail");
  if (!state.selectedTimeYear) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const yrKey = String(state.selectedTimeYear);
  const bpYr = appData.buildingPermits.processingTimes.byYear[yrKey];
  const luDec = appData.landUsePermits.reviewTimes.appToDecisionByYear[yrKey];
  const luIss = appData.landUsePermits.reviewTimes.appToIssuedByYear[yrKey];
  if (!bpYr) {
    panel.hidden = true;
    return;
  }
  const activeEntry = stageConfig[state.timeStage].map[yrKey];
  panel.hidden = false;
  panel.innerHTML = `
    <div class="detail-panel-head">
      <h3 class="detail-panel-title">${yrKey === "2026" ? "2026 (YTD)" : yrKey} turnaround snapshot across all four stages</h3>
      <button type="button" class="btn-secondary" id="clear-time-year-btn">Clear</button>
    </div>
    <div class="detail-metrics-row">
      <div>
        <div class="detail-metric-k">Building review (App to Iss)</div>
        <div class="detail-metric-v">${bpYr.app_to_iss.median}d med</div>
        <div class="detail-metric-k">${bpYr.app_to_iss.mean.toFixed(1)}d avg | p90: ${bpYr.app_to_iss.p90}d (n=${fmtNum(bpYr.app_to_iss.n)})</div>
      </div>
      <div>
        <div class="detail-metric-k">Construction (Iss to Comp)</div>
        <div class="detail-metric-v">${bpYr.iss_to_comp.median}d med</div>
        <div class="detail-metric-k">${bpYr.iss_to_comp.mean.toFixed(1)}d avg | p90: ${bpYr.iss_to_comp.p90}d (n=${fmtNum(bpYr.iss_to_comp.n)})</div>
      </div>
      <div>
        <div class="detail-metric-k">Land Use MUP decision</div>
        <div class="detail-metric-v">${luDec.median}d med</div>
        <div class="detail-metric-k">${luDec.mean.toFixed(1)}d avg | p75: ${luDec.p75}d (n=${fmtNum(luDec.n)})</div>
      </div>
      <div>
        <div class="detail-metric-k">Land Use MUP issuance</div>
        <div class="detail-metric-v">${luIss.median}d med</div>
        <div class="detail-metric-k">${luIss.mean.toFixed(1)}d avg | p75: ${luIss.p75}d (n=${fmtNum(luIss.n)})</div>
      </div>
    </div>
    ${activeEntry ? `<div class="methodology-footnote">Selected series (${stageConfig[state.timeStage].label}): 75th percentile ${activeEntry.p75} days${activeEntry.p90 ? `, 90th percentile ${activeEntry.p90} days` : ""}.</div>` : ""}
  `;
  document.getElementById("clear-time-year-btn").addEventListener("click", () => {
    state.selectedTimeYear = null;
    renderTurnaroundSection();
  });
}

function renderClassDetail() {
  const panel = document.getElementById("class-range-detail");
  if (!state.selectedClassName) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const name = state.selectedClassName;
  const bp = appData.buildingPermits.processingTimes.byClass[name];
  const lu = appData.landUsePermits.reviewTimes.appToIssuedByClass[name];
  if (!bp && !lu) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  panel.innerHTML = `
    <div class="detail-panel-head">
      <h4 class="detail-panel-title">${name} duration percentiles (2016 to 2026)</h4>
      <div class="detail-panel-actions">
        <button type="button" class="btn-primary" id="jump-class-pipeline-btn">View in Pipeline</button>
        <button type="button" class="btn-secondary" id="clear-class-detail-btn">Clear</button>
      </div>
    </div>
    <div class="detail-metrics-row">
      ${bp ? `<div><div class="detail-metric-k">Building review</div><div class="detail-metric-v">${bp.app_to_iss.median}d med</div><div class="detail-metric-k">${bp.app_to_iss.mean.toFixed(1)}d avg | p90: ${bp.app_to_iss.p90}d</div></div>` : ""}
      ${bp ? `<div><div class="detail-metric-k">Construction</div><div class="detail-metric-v">${bp.iss_to_comp.median}d med</div><div class="detail-metric-k">${bp.iss_to_comp.mean.toFixed(1)}d avg | p90: ${bp.iss_to_comp.p90}d</div></div>` : ""}
      ${lu ? `<div><div class="detail-metric-k">Land Use MUP</div><div class="detail-metric-v">${lu.median}d med</div><div class="detail-metric-k">${lu.mean.toFixed(1)}d avg | p75: ${lu.p75}d</div></div>` : ""}
    </div>
  `;
  document.getElementById("clear-class-detail-btn").addEventListener("click", () => {
    state.selectedClassName = null;
    renderTurnaroundSection();
  });
  document.getElementById("jump-class-pipeline-btn").addEventListener("click", () => {
    state.projectSearch = name === "Single Family/Duplex" ? "Single" : name;
    document.getElementById("project-search").value = state.projectSearch;
    renderPipelineSection();
    document.getElementById("pipeline").scrollIntoView({ behavior: "smooth" });
  });
}

function renderPipelineSection() {
  const isBP = state.pipelineKind === "building";
  const terminal = new Set(["Completed", "Expired", "Closed", "Withdrawn", "Canceled", "Denied"]);
  const rawStatuses = (isBP ? appData.buildingPermits.byStatus : appData.landUsePermits.byStatus)
    .filter((s) => !terminal.has(s.status));

  // Aggregate into 4 clear pipeline phases
  const phaseDefs = [
    { id: "corrections", label: "Corrections & Info Needed", color: "var(--ochre)", units: 0, cnt: 0 },
    { id: "intake", label: "Intake & Active Review", color: "var(--ochre)", units: 0, cnt: 0 },
    { id: "ready", label: "Ready to Issue / Occupy", color: "var(--marine)", units: 0, cnt: 0 },
    { id: "construction", label: isBP ? "Issued / Construction" : "Issued MUPs", color: "var(--pine)", units: 0, cnt: 0 }
  ];
  rawStatuses.forEach((s) => {
    const p = phaseDefs.find((d) => d.id === classifyPipelinePhase(s.status));
    if (p) {
      p.units += s.units_added || 0;
      p.cnt += s.cnt || 0;
    }
  });

  const maxUnits = Math.max(...phaseDefs.map((p) => p.units), 1);
  const funnelGrid = document.getElementById("status-funnel-grid");
  funnelGrid.innerHTML = phaseDefs
    .map((p) => {
      const active = state.pipelinePhase === p.id;
      return `
        <button type="button" class="funnel-cell ${active ? "active" : ""}" aria-pressed="${active}" data-phase="${p.id}">
          <span class="funnel-stage">${p.label}</span>
          <span class="funnel-units">${fmtNum(p.units)} units</span>
          <span class="funnel-meta">${fmtNum(p.cnt)} open permits</span>
          <span class="funnel-bar"><span class="funnel-bar-fill" style="width:${Math.max(4, (p.units / maxUnits) * 100)}%;background:${p.color}"></span></span>
        </button>
      `;
    })
    .join("");

  funnelGrid.querySelectorAll(".funnel-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const clicked = cell.dataset.phase;
      state.pipelinePhase = state.pipelinePhase === clicked ? "all" : clicked;
      renderPipelineSection();
    });
  });

  document.getElementById("exclude-demo-wrap").hidden = !isBP;
  document.getElementById("projects-table-heading").textContent = isBP
    ? "Largest active housing building permits"
    : "Largest active housing Land Use Master Use Permits";

  const allProjects = isBP
    ? state.excludeDemo
      ? [...appData.buildingPermits.top25BuildingActive]
      : [...appData.buildingPermits.top25BuildingActive, ...appData.buildingPermits.topDemolitionActive]
    : [...appData.landUsePermits.top15Active];

  let projects = [...allProjects];
  const q = state.projectSearch.trim().toLowerCase();
  if (state.pipelinePhase !== "all") {
    projects = projects.filter((p) => classifyPipelinePhase(p.statuscurrent) === state.pipelinePhase);
  }
  if (q) {
    projects = projects.filter(
      (p) =>
        p.originaladdress1.toLowerCase().includes(q) ||
        p.permitnum.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.permitclass.toLowerCase().includes(q) ||
        (p.originalzip || "").includes(q)
    );
  }

  if (state.projectSort === "units_desc") {
    projects.sort((a, b) => b.housingunitsadded - a.housingunitsadded);
  } else if (state.projectSort === "cost_desc") {
    projects.sort((a, b) => b.estprojectcost - a.estprojectcost);
  } else if (state.projectSort === "applied_desc") {
    projects.sort((a, b) => (b.applieddate || "").localeCompare(a.applieddate || ""));
  }

  const hasFilters = state.pipelinePhase !== "all" || Boolean(q);
  document.getElementById("reset-pipeline-filters-btn").hidden = !hasFilters;
  document.getElementById("projects-table-count").textContent =
    `Showing ${projects.length} of ${allProjects.length} major active ${isBP ? "building" : "land use"} projects. Select any address to inspect full permit details.`;

  const tbody = document.getElementById("projects-table-body");
  if (!projects.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ink-muted);padding:1.75rem">No active projects match the current filter. <button type="button" class="btn-secondary" id="inline-reset-btn" style="margin-left:0.5rem">Reset filters</button></td></tr>`;
    document.getElementById("inline-reset-btn")?.addEventListener("click", resetPipelineFilters);
    return;
  }

  const refDate = getReferenceDateStr();
  tbody.innerHTML = projects
    .map((p, idx) => {
      const waitDays = p.issueddate ? daysBetween(p.applieddate, p.issueddate) : daysBetween(p.applieddate, refDate);
      const waitLabel = p.issueddate
        ? `Issued ${p.issueddate} (${waitDays}d)`
        : `In review (${waitDays ? `${waitDays}d elapsed` : "pending"})`;
      return `
        <tr>
          <td>
            <button type="button" class="row-trigger-btn" data-proj-idx="${idx}">
              <span class="cell-primary">${p.originaladdress1}</span>
              <span class="cell-secondary">${p.permitnum}${p.originalzip ? ` (${p.originalzip})` : ""}${p.permittypemapped === "Demolition" ? " [Demolition]" : ""}</span>
            </button>
          </td>
          <td>${p.permitclass}</td>
          <td><span class="status-cell ${getStatusStyle(p.statuscurrent)}">${p.statuscurrent}</span></td>
          <td class="num">
            <div class="cell-primary">+${fmtNum(p.housingunitsadded)}</div>
            ${p.housingunitsremoved > 0 ? `<span class="cell-secondary delta-neg">-${fmtNum(p.housingunitsremoved)} removed</span>` : ""}
          </td>
          <td class="num">${p.estprojectcost > 0 ? fmtCompactCurrency(p.estprojectcost) : "Not listed"}</td>
          <td class="num">
            <div>${p.applieddate || "N/A"}</div>
            <span class="cell-secondary">${waitLabel}</span>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll("button[data-proj-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openDrawer(projects[Number(btn.dataset.projIdx)], btn);
    });
  });
}

function resetPipelineFilters() {
  state.pipelinePhase = "all";
  state.projectSearch = "";
  document.getElementById("project-search").value = "";
  renderPipelineSection();
}

function renderGeographySection() {
  const clearBtn = document.getElementById("clear-zip-btn");
  clearBtn.hidden = !state.selectedZip;

  renderSeattleMap({
    container: document.getElementById("seattle-map-stage"),
    tooltipEl,
    points: appData.buildingPermits.mapPoints,
    statusFilter: state.mapStatusFilter,
    selectedZip: state.selectedZip,
    onSelectPoint: async (pt, triggerEl) => {
      const match =
        appData.buildingPermits.top25BuildingActive.find((p) => p.permitnum === pt.permitnum) ||
        appData.buildingPermits.topDemolitionActive.find((p) => p.permitnum === pt.permitnum);
      if (match) {
        openDrawer(match, triggerEl);
        return;
      }
      // Show initial record immediately and fetch live full details from data.seattle.gov on demand
      const placeholder = {
        permitnum: pt.permitnum,
        originaladdress1: `Loading live SDCI record (${pt.permitnum})...`,
        originalzip: pt.zip,
        permitclass: pt.permitclass,
        permittypemapped: "Building",
        statuscurrent: pt.status,
        housingunitsadded: pt.units,
        housingunitsremoved: 0,
        estprojectcost: 0,
        applieddate: "",
        issueddate: "",
        latitude: pt.lat,
        longitude: pt.lng,
        description: "Fetching full address, valuation, dates, and scope directly from data.seattle.gov...",
        link: `https://services.seattle.gov/portal/customize/LinkToRecord.aspx?altId=${pt.permitnum}`
      };
      openDrawer(placeholder, triggerEl);
      try {
        let token = "";
        try { token = localStorage.getItem("seattle_socrata_token") || ""; } catch {}
        const live = await fetchPermitByNum(pt.permitnum, token);
        if (live && !document.getElementById("detail-drawer").hidden) {
          openDrawer(live, triggerEl);
        }
      } catch {
        // leave initial metadata with direct Seattle Services Portal link
      }
    }
  });

  const zips = appData.buildingPermits.activeByZip;
  const maxZipUnits = Math.max(...zips.map((z) => z.units_added), 1);
  const zipList = document.getElementById("zip-ranking-list");
  zipList.innerHTML = zips
    .map((z) => {
      const isSelected = state.selectedZip === z.zip;
      return `
        <button type="button" class="zip-row ${isSelected ? "selected" : ""}" aria-pressed="${isSelected}" data-zip="${z.zip}">
          <div class="zip-row-head">
            <span class="zip-title">${z.zip}<span class="zip-hood">${z.neighborhood}</span></span>
            <span class="zip-units">${fmtNum(z.units_added)} units</span>
          </div>
          <div class="bar-track" style="height:5px">
            <div class="bar-fill ${isSelected ? "bar-fill-marine" : ""}" style="width:${Math.max(3, (z.units_added / maxZipUnits) * 100)}%"></div>
          </div>
          <div class="zip-sub">
            <span>${fmtNum(z.cnt)} active housing permits</span>
            <span>Net: <span class="delta-pos">+${fmtNum(z.units_added - z.units_removed)}</span></span>
          </div>
        </button>
      `;
    })
    .join("");

  zipList.querySelectorAll(".zip-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const z = btn.dataset.zip;
      state.selectedZip = state.selectedZip === z ? null : z;
      renderGeographySection();
    });
  });
}

function openDrawer(project, triggerEl = null) {
  if (triggerEl) lastFocusedBeforeDrawer = triggerEl;
  document.getElementById("drawer-permit-num").textContent =
    `${project.permitnum} | ${project.permittypemapped || "Permit"} (${project.permitclass})`;
  document.getElementById("drawer-title").textContent = project.originaladdress1;

  const costPerUnit =
    project.estprojectcost > 0 && project.housingunitsadded > 0
      ? fmtCompactCurrency(project.estprojectcost / project.housingunitsadded)
      : "Not reported";
  const refDate = getReferenceDateStr();
  const wait = project.issueddate
    ? `${daysBetween(project.applieddate, project.issueddate)} days to issue`
    : project.applieddate
      ? `${daysBetween(project.applieddate, refDate)} days in review`
      : "Not listed";

  document.getElementById("drawer-body").innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap">
      <span class="status-cell ${getStatusStyle(project.statuscurrent)}">${project.statuscurrent}</span>
      ${project.originalzip ? `<button type="button" class="btn-secondary" id="drawer-filter-zip-btn">Filter Pipeline to ${project.originalzip}</button>` : ""}
    </div>
    <div class="drawer-kv-grid">
      <div>
        <div class="drawer-kv-label">Housing units added</div>
        <div class="drawer-kv-value">+${fmtNum(project.housingunitsadded)}</div>
      </div>
      <div>
        <div class="drawer-kv-label">Housing units removed</div>
        <div class="drawer-kv-value">${fmtNum(project.housingunitsremoved)}</div>
      </div>
      <div>
        <div class="drawer-kv-label">Estimated valuation</div>
        <div class="drawer-kv-value">${project.estprojectcost > 0 ? fmtCompactCurrency(project.estprojectcost) : "Not listed"}</div>
      </div>
      <div>
        <div class="drawer-kv-label">Est. valuation per unit</div>
        <div class="drawer-kv-value">${costPerUnit}</div>
      </div>
      <div>
        <div class="drawer-kv-label">Applied date</div>
        <div class="drawer-kv-value">${project.applieddate || "Not listed"}</div>
      </div>
      <div>
        <div class="drawer-kv-label">Review duration</div>
        <div class="drawer-kv-value">${wait}</div>
      </div>
      ${project.decisiondate ? `<div><div class="drawer-kv-label">Decision date</div><div class="drawer-kv-value">${project.decisiondate}</div></div>` : ""}
      ${project.issueddate ? `<div><div class="drawer-kv-label">Issued date</div><div class="drawer-kv-value">${project.issueddate}</div></div>` : ""}
      <div>
        <div class="drawer-kv-label">ZIP code</div>
        <div class="drawer-kv-value">${project.originalzip || "Seattle"}</div>
      </div>
      <div>
        <div class="drawer-kv-label">Coordinates</div>
        <div class="drawer-kv-value">${project.latitude ? `${project.latitude.toFixed(4)}, ${project.longitude.toFixed(4)}` : "N/A"}</div>
      </div>
    </div>
    <div>
      <h4 class="sub-heading">Scope description</h4>
      <p class="drawer-desc">${project.description || "No detailed scope description provided in SDCI record."}</p>
    </div>
    ${project.link ? `<div><a class="btn-primary" href="${project.link}" target="_blank" rel="noopener noreferrer">View official SDCI permit record</a></div>` : ""}
  `;

  document.getElementById("drawer-filter-zip-btn")?.addEventListener("click", () => {
    state.projectSearch = project.originalzip;
    document.getElementById("project-search").value = project.originalzip;
    closeDrawer();
    renderPipelineSection();
    document.getElementById("pipeline").scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("drawer-backdrop").hidden = false;
  document.getElementById("detail-drawer").hidden = false;
  document.getElementById("drawer-close").focus();
}

function closeDrawer() {
  document.getElementById("drawer-backdrop").hidden = true;
  document.getElementById("detail-drawer").hidden = true;
  if (lastFocusedBeforeDrawer && typeof lastFocusedBeforeDrawer.focus === "function") {
    lastFocusedBeforeDrawer.focus();
  }
}

function wireEvents() {
  const header = document.getElementById("site-header");
  window.addEventListener(
    "scroll",
    () => {
      header.classList.toggle("scrolled", window.scrollY > 8);
    },
    { passive: true }
  );

  // Scroll-spy for desktop nav & mobile jump-bar
  const sections = ["overview", "production", "turnaround", "pipeline", "geography"];
  const navLinks = document.querySelectorAll(".main-nav a[href^='#'], .mobile-jump-inner a[href^='#']");
  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = `#${entry.target.id}`;
            navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === id));
          }
        });
      },
      { rootMargin: "-25% 0px -65% 0px" }
    );
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
  }

  // Production dataset glossary selector
  document.getElementById("dataset-glossary").addEventListener("click", (e) => {
    const card = e.target.closest(".glossary-item[data-dataset]");
    if (!card) return;
    state.prodDataset = card.dataset.dataset;
    renderProductionSection();
  });

  const prodMetricTabs = document.getElementById("prod-metric-tabs");
  prodMetricTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-metric]");
    if (!btn || btn.disabled) return;
    state.prodMetric = btn.dataset.metric;
    setGroupActive(prodMetricTabs, "metric", state.prodMetric);
    renderProductionSection();
  });

  document.getElementById("prod-date-basis").addEventListener("change", (e) => {
    state.prodDateBasis = e.target.value;
    renderProductionSection();
  });

  // Turnaround controls
  const timeTabs = document.getElementById("time-series-tabs");
  timeTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-stage]");
    if (!btn) return;
    state.timeStage = btn.dataset.stage;
    setGroupActive(timeTabs, "stage", state.timeStage);
    renderTurnaroundSection();
  });

  document.getElementById("time-show-p90").addEventListener("change", (e) => {
    state.timeShowSpread = e.target.checked;
    renderTurnaroundSection();
  });

  const classTimeTabs = document.getElementById("class-time-tabs");
  classTimeTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-kind]");
    if (!btn) return;
    state.classTimeKind = btn.dataset.kind;
    setGroupActive(classTimeTabs, "kind", state.classTimeKind);
    renderTurnaroundSection();
  });

  // Pipeline controls
  const pipelineTabs = document.getElementById("pipeline-dataset-tabs");
  pipelineTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-kind]");
    if (!btn) return;
    state.pipelineKind = btn.dataset.kind;
    state.pipelinePhase = "all";
    setGroupActive(pipelineTabs, "kind", state.pipelineKind);
    renderPipelineSection();
  });

  document.getElementById("project-search").addEventListener("input", (e) => {
    state.projectSearch = e.target.value;
    renderPipelineSection();
  });

  document.getElementById("project-sort").addEventListener("change", (e) => {
    state.projectSort = e.target.value;
    renderPipelineSection();
  });

  document.getElementById("exclude-demo-toggle").addEventListener("change", (e) => {
    state.excludeDemo = e.target.checked;
    renderPipelineSection();
  });

  document.getElementById("reset-pipeline-filters-btn").addEventListener("click", resetPipelineFilters);

  // Map controls
  const mapTabs = document.getElementById("map-status-tabs");
  mapTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    state.mapStatusFilter = btn.dataset.filter;
    setGroupActive(mapTabs, "filter", state.mapStatusFilter);
    renderGeographySection();
  });

  document.getElementById("clear-zip-btn").addEventListener("click", () => {
    state.selectedZip = null;
    renderGeographySection();
  });

  // Drawer close + focus trap + "/" search shortcut
  const drawer = document.getElementById("detail-drawer");
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) {
      closeDrawer();
      return;
    }
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      const input = document.getElementById("project-search");
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus();
      return;
    }
    if (e.key === "Tab" && !drawer.hidden) {
      const focusables = drawer.querySelectorAll("button, a[href], input, select, [tabindex]:not([tabindex='-1'])");
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Live API refresh
  const refreshBtn = document.getElementById("refresh-live-btn");
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add("is-loading");
    refreshBtn.querySelector(".btn-label").textContent = "Syncing...";
    const freshnessEl = document.getElementById("data-freshness");
    let token = "";
    try { token = localStorage.getItem("seattle_socrata_token") || ""; } catch {}
    try {
      appData = await refreshLiveSeattleData(appData, token);
      const ts = new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
      freshnessEl.textContent = `Live synced directly from data.seattle.gov on ${ts}.`;
      renderAll();
    } catch {
      freshnessEl.textContent = "Live sync could not reach data.seattle.gov; showing verified Nov 25, 2026 baseline.";
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("is-loading");
      refreshBtn.querySelector(".btn-label").textContent = "Sync live API";
    }
  });
}

function renderAll() {
  renderKPIs();
  renderTypologyTimelines();
  renderProductionSection();
  renderHistoricalBenchmarks();
  renderTurnaroundSection();
  renderPipelineSection();
  renderGeographySection();
}

wireEvents();
renderAll();
