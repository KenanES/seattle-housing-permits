// Interactive Seattle geographic permit map styled for Civic Broadsheet (WCAG AA compliant labels & keyboard access)
import { fmtNum, positionTooltip } from "./charts.js";

const BOUNDS = {
  minLat: 47.492,
  maxLat: 47.742,
  minLng: -122.442,
  maxLng: -122.230
};

const W = 540;
const H = 620;

function project(lat, lng) {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * W;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * H;
  return [Number(x.toFixed(1)), Number(y.toFixed(1))];
}

function polyPath(coords) {
  return coords
    .map(([lat, lng], i) => {
      const [x, y] = project(lat, lng);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ") + " Z";
}

function linePath(coords) {
  return coords
    .map(([lat, lng], i) => {
      const [x, y] = project(lat, lng);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

const MAIN_SEATTLE_LAND = [
  [47.738, -122.392], [47.738, -122.278], [47.721, -122.279], [47.704, -122.275],
  [47.690, -122.264], [47.680, -122.248], [47.669, -122.256], [47.658, -122.273],
  [47.648, -122.288], [47.643, -122.299], [47.638, -122.280], [47.624, -122.278],
  [47.606, -122.284], [47.590, -122.286], [47.575, -122.284], [47.558, -122.268],
  [47.542, -122.263], [47.526, -122.261], [47.510, -122.250], [47.495, -122.248],
  [47.495, -122.332], [47.512, -122.336], [47.530, -122.336], [47.551, -122.341],
  [47.571, -122.352], [47.586, -122.356], [47.589, -122.345], [47.578, -122.342],
  [47.594, -122.339], [47.606, -122.342], [47.619, -122.355], [47.628, -122.373],
  [47.634, -122.404], [47.646, -122.416], [47.660, -122.426], [47.668, -122.404],
  [47.667, -122.388], [47.682, -122.405], [47.696, -122.398], [47.718, -122.390]
];

const WEST_SEATTLE_LAND = [
  [47.594, -122.384], [47.587, -122.369], [47.574, -122.358], [47.552, -122.348],
  [47.526, -122.343], [47.501, -122.345], [47.496, -122.393], [47.515, -122.396],
  [47.536, -122.398], [47.558, -122.401], [47.576, -122.419], [47.585, -122.411]
];

const LAKE_UNION_WATER = [
  [47.649, -122.388], [47.657, -122.364], [47.651, -122.342], [47.647, -122.326],
  [47.648, -122.313], [47.645, -122.303], [47.641, -122.306], [47.641, -122.321],
  [47.630, -122.328], [47.626, -122.337], [47.634, -122.344], [47.645, -122.342],
  [47.651, -122.362], [47.663, -122.392]
];

const GREEN_LAKE_WATER = [
  [47.683, -122.339], [47.683, -122.329], [47.676, -122.326], [47.673, -122.336],
  [47.678, -122.343]
];

const I5_CORRIDOR = [
  [47.734, -122.325], [47.705, -122.326], [47.676, -122.322], [47.652, -122.322],
  [47.624, -122.327], [47.606, -122.329], [47.585, -122.320], [47.552, -122.315],
  [47.520, -122.302], [47.495, -122.295]
];

const I90_CORRIDOR = [
  [47.595, -122.324], [47.590, -122.306], [47.590, -122.286], [47.589, -122.248]
];

const LABELS = [
  { name: "Northgate", lat: 47.716, lng: -122.328 },
  { name: "Ballard", lat: 47.680, lng: -122.386 },
  { name: "U-District", lat: 47.674, lng: -122.297 },
  { name: "Fremont", lat: 47.658, lng: -122.362 },
  { name: "SLU", lat: 47.633, lng: -122.356 },
  { name: "Capitol Hill", lat: 47.628, lng: -122.299 },
  { name: "Downtown", lat: 47.606, lng: -122.358 },
  { name: "Central Dist.", lat: 47.604, lng: -122.295 },
  { name: "West Seattle", lat: 47.562, lng: -122.384 },
  { name: "Beacon Hill", lat: 47.567, lng: -122.320 },
  { name: "Rainier Valley", lat: 47.535, lng: -122.282 }
];

const WATER_LABELS = [
  { name: "Puget Sound", lat: 47.615, lng: -122.410 },
  { name: "Lake Washington", lat: 47.630, lng: -122.256 }
];

export function classifyMapStatus(status) {
  if (status === "Issued" || status === "Phase Issued") return "issued";
  if (status === "Approved to Occupy" || status === "Ready for Issuance" || status === "Reviews Completed") return "ready";
  return "review";
}

function statusColor(cat) {
  if (cat === "issued") return "#1b4d3e";
  if (cat === "ready") return "#234e70";
  return "#96520e";
}

export function renderSeattleMap({
  container,
  tooltipEl,
  points,
  statusFilter,
  selectedZip,
  onSelectPoint
}) {
  const filtered = points.filter((p) => {
    const cat = classifyMapStatus(p.status);
    if (statusFilter === "issued" && cat !== "issued") return false;
    if (statusFilter === "review" && cat !== "review") return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => b.units - a.units);

  const dotsSvg = sorted
    .map((p, idx) => {
      const [x, y] = project(p.lat, p.lng);
      const cat = classifyMapStatus(p.status);
      const color = statusColor(cat);
      const r = Math.max(4.5, Math.min(18, Math.sqrt(p.units) * 0.62));
      const zipMatch = !selectedZip || p.zip === selectedZip;
      const opacity = zipMatch ? 0.85 : 0.14;
      const stroke = selectedZip && p.zip === selectedZip ? "#171614" : "#faf7f2";
      const strokeW = selectedZip && p.zip === selectedZip ? 1.6 : 0.85;

      return `
        <circle
          cx="${x}"
          cy="${y}"
          r="${r.toFixed(1)}"
          fill="${color}"
          fill-opacity="${opacity}"
          stroke="${stroke}"
          stroke-width="${strokeW}"
          class="map-dot"
          data-idx="${idx}"
          tabindex="0"
          role="button"
          aria-label="Permit ${p.permitnum}, ${fmtNum(p.units)} units, ${p.status}, ZIP ${p.zip || "Seattle"}. Click to inspect."
        />
      `;
    })
    .join("");

  const labelsSvg = LABELS.map((l) => {
    const [x, y] = project(l.lat, l.lng);
    return `<text x="${x}" y="${y}" text-anchor="middle" style="font-family:'Public Sans',sans-serif;font-size:11.5px;font-weight:600;fill:#38352f;pointer-events:none;paint-order:stroke;stroke:#faf7f2;stroke-width:3.2px">${l.name}</text>`;
  }).join("");

  // Darkened water label (#355666 on #dbe6ea = 6.0:1 WCAG AA contrast)
  const waterSvg = WATER_LABELS.map((l) => {
    const [x, y] = project(l.lat, l.lng);
    return `<text x="${x}" y="${y}" text-anchor="middle" style="font-family:'Newsreader',Georgia,serif;font-size:12.5px;font-style:italic;fill:#355666;pointer-events:none">${l.name}</text>`;
  }).join("");

  container.innerHTML = `
    <svg class="map-svg" viewBox="0 0 ${W} ${H}" aria-label="Interactive map of active Seattle housing permit sites">
      <rect width="${W}" height="${H}" fill="#dbe6ea" />
      <path d="${polyPath(MAIN_SEATTLE_LAND)}" fill="#faf7f2" stroke="#b9c6cb" stroke-width="1.25" />
      <path d="${polyPath(WEST_SEATTLE_LAND)}" fill="#faf7f2" stroke="#b9c6cb" stroke-width="1.25" />
      <path d="${polyPath(LAKE_UNION_WATER)}" fill="#dbe6ea" stroke="#b9c6cb" stroke-width="1" />
      <path d="${polyPath(GREEN_LAKE_WATER)}" fill="#dbe6ea" stroke="#b9c6cb" stroke-width="0.9" />
      <path d="${linePath(I5_CORRIDOR)}" fill="none" stroke="#d5cdc0" stroke-width="1.4" stroke-dasharray="4,3" />
      <path d="${linePath(I90_CORRIDOR)}" fill="none" stroke="#d5cdc0" stroke-width="1.4" stroke-dasharray="4,3" />
      ${waterSvg}
      <g>${dotsSvg}</g>
      ${labelsSvg}
    </svg>
  `;

  container.querySelectorAll(".map-dot").forEach((dot) => {
    dot.addEventListener("mousemove", (e) => {
      const p = sorted[Number(dot.dataset.idx)];
      tooltipEl.innerHTML = `
        <div class="tooltip-title">${p.permitnum} (${fmtNum(p.units)} units)</div>
        <div class="tooltip-row"><span class="tooltip-muted">Status</span><strong>${p.status}</strong></div>
        <div class="tooltip-row"><span class="tooltip-muted">Class</span><span>${p.permitclass}</span></div>
        <div class="tooltip-row"><span class="tooltip-muted">ZIP code</span><span>${p.zip || "Seattle"}</span></div>
        <div style="margin-top:4px;font-size:11px;color:#b9b2a7">Click dot for full permit record</div>
      `;
      tooltipEl.hidden = false;
      positionTooltip(tooltipEl, e.clientX, e.clientY);
    });
    dot.addEventListener("mouseleave", () => {
      tooltipEl.hidden = true;
    });
    const activate = () => {
      const p = sorted[Number(dot.dataset.idx)];
      if (onSelectPoint) onSelectPoint(p, dot);
    };
    dot.addEventListener("click", activate);
    dot.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
}
