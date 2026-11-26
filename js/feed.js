import { SEATTLE_SNAPSHOT } from "../data/seattle-snapshot.js";
import { runPresetSoqlQuery } from "./api.js";
import { fmtNum } from "./charts.js";

const tokenInput = document.getElementById("socrata-token-input");
const presetSelect = document.getElementById("live-query-preset");
const runBtn = document.getElementById("run-query-btn");
const statusEl = document.getElementById("query-status");
const bodyEl = document.getElementById("live-query-results-body");

function renderCatalog() {
  document.getElementById("catalog-list").innerHTML = SEATTLE_SNAPSHOT.catalog
    .map(
      (c) => `
      <div class="catalog-item">
        <div>
          <a class="catalog-title" href="https://data.seattle.gov/d/${c.id}" target="_blank" rel="noopener noreferrer">${c.title}</a>
          <p class="catalog-desc">${c.desc}</p>
        </div>
        <div class="catalog-meta">
          <div><code>${c.id}</code></div>
          <div>${c.rows} rows</div>
        </div>
      </div>
    `
    )
    .join("");
}

async function fetchFeed() {
  const preset = presetSelect.value;
  runBtn.disabled = true;
  statusEl.textContent = "Fetching live records from data.seattle.gov...";
  try {
    const res = await runPresetSoqlQuery(preset, tokenInput.value.trim());
    statusEl.textContent = `Returned ${res.rows.length} live records: ${res.label}.`;
    bodyEl.innerHTML = res.rows
      .map(
        (r) => `
        <tr>
          <td>${r.link ? `<a class="catalog-title mono" href="${r.link}" target="_blank" rel="noopener noreferrer">${r.permitnum}</a>` : `<span class="mono">${r.permitnum}</span>`}</td>
          <td class="cell-primary">${r.address}</td>
          <td>${r.meta}</td>
          <td class="num">${fmtNum(r.units)}</td>
          <td class="num">${r.date || "N/A"}</td>
        </tr>
      `
      )
      .join("");
  } catch {
    statusEl.textContent = "Live query could not reach data.seattle.gov. Check your connection or add a Socrata App Token.";
  } finally {
    runBtn.disabled = false;
  }
}

try {
  tokenInput.value = localStorage.getItem("seattle_socrata_token") || "";
  tokenInput.addEventListener("change", () => {
    localStorage.setItem("seattle_socrata_token", tokenInput.value.trim());
  });
} catch {
  // ignore storage errors
}

runBtn.addEventListener("click", fetchFeed);
presetSelect.addEventListener("change", fetchFeed);

renderCatalog();
fetchFeed();
