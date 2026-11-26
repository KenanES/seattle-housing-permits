// Live client-side Socrata SODA API connector for https://data.seattle.gov (CORS enabled)

const BASE = "https://data.seattle.gov/resource";

export const ENDPOINTS = {
  building: `${BASE}/76t5-zqzr.json`,
  landuse: `${BASE}/ht3q-kdvx.json`,
  trade: `${BASE}/c87v-5hwh.json`
};

function buildHeaders(token) {
  const headers = { Accept: "application/json" };
  if (token && token.trim()) {
    headers["X-App-Token"] = token.trim();
  }
  return headers;
}

async function fetchSoql(endpoint, params, token) {
  const url = new URL(endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: buildHeaders(token) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from data.seattle.gov`);
  }
  return res.json();
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function normalizeYearRows(rows) {
  return rows
    .filter((r) => r.yr && /^\d{4}$/.test(String(r.yr)))
    .map((r) => ({
      yr: Number(r.yr),
      cnt: toInt(r.cnt),
      units_added: toInt(r.units_added),
      units_removed: toInt(r.units_removed),
      total_cost: toInt(r.total_cost)
    }))
    .sort((a, b) => a.yr - b.yr);
}

export async function refreshLiveSeattleData(currentData, token = "") {
  const [
    bpApplied,
    bpIssued,
    bpStatus,
    bpTopBuilding,
    luApplied,
    luIssued,
    luStatus
  ] = await Promise.all([
    fetchSoql(ENDPOINTS.building, {
      $select: "date_extract_y(applieddate) as yr, count(*) as cnt, sum(housingunitsadded) as units_added, sum(housingunitsremoved) as units_removed, sum(estprojectcost) as total_cost",
      $where: "applieddate >= '2014-01-01T00:00:00'",
      $group: "yr",
      $order: "yr ASC",
      $limit: "50"
    }, token),
    fetchSoql(ENDPOINTS.building, {
      $select: "date_extract_y(issueddate) as yr, count(*) as cnt, sum(housingunitsadded) as units_added, sum(housingunitsremoved) as units_removed, sum(estprojectcost) as total_cost",
      $where: "issueddate >= '2014-01-01T00:00:00'",
      $group: "yr",
      $order: "yr ASC",
      $limit: "50"
    }, token),
    fetchSoql(ENDPOINTS.building, {
      $select: "statuscurrent as status, count(*) as cnt, sum(housingunitsadded) as units_added, sum(housingunitsremoved) as units_removed, sum(estprojectcost) as total_cost",
      $group: "statuscurrent",
      $order: "cnt DESC",
      $limit: "50"
    }, token),
    fetchSoql(ENDPOINTS.building, {
      $select: "permitnum, permitclass, permittypemapped, statuscurrent, originaladdress1, originalzip, housingunitsadded, housingunitsremoved, estprojectcost, applieddate, issueddate, latitude, longitude, description, link",
      $where: "permittypemapped = 'Building' AND housingunitsadded > 0 AND applieddate >= '2021-01-01T00:00:00' AND statuscurrent NOT IN ('Completed','Expired','Closed','Withdrawn','Canceled','Denied')",
      $order: "housingunitsadded DESC",
      $limit: "25"
    }, token),
    fetchSoql(ENDPOINTS.landuse, {
      $select: "date_extract_y(applieddate::floating_timestamp) as yr, count(*) as cnt, sum(housingunitsadded) as units_added, sum(housingunitsremoved) as units_removed",
      $where: "applieddate >= '2014-01-01'",
      $group: "yr",
      $order: "yr ASC",
      $limit: "50"
    }, token),
    fetchSoql(ENDPOINTS.landuse, {
      $select: "date_extract_y(issueddate::floating_timestamp) as yr, count(*) as cnt, sum(housingunitsadded) as units_added, sum(housingunitsremoved) as units_removed",
      $where: "issueddate >= '2014-01-01'",
      $group: "yr",
      $order: "yr ASC",
      $limit: "50"
    }, token),
    fetchSoql(ENDPOINTS.landuse, {
      $select: "statuscurrent as status, count(*) as cnt, sum(housingunitsadded) as units_added, sum(housingunitsremoved) as units_removed",
      $group: "statuscurrent",
      $order: "cnt DESC",
      $limit: "50"
    }, token)
  ]);

  const updated = structuredClone(currentData);
  const now = new Date();
  updated.meta.fetchedAt = now.toISOString();
  updated.meta.isLive = true;

  if (bpApplied.length) updated.buildingPermits.byAppliedYear = normalizeYearRows(bpApplied);
  if (bpIssued.length) updated.buildingPermits.byIssuedYear = normalizeYearRows(bpIssued);
  if (bpStatus.length) {
    updated.buildingPermits.byStatus = bpStatus
      .filter((r) => r.status)
      .map((r) => ({
        status: r.status,
        cnt: toInt(r.cnt),
        units_added: toInt(r.units_added),
        units_removed: toInt(r.units_removed),
        total_cost: toInt(r.total_cost)
      }));
  }
  if (bpTopBuilding.length) {
    updated.buildingPermits.top25BuildingActive = bpTopBuilding.map((r) => ({
      permitnum: r.permitnum || "",
      permitclass: r.permitclass || "Multifamily",
      permittypemapped: r.permittypemapped || "Building",
      statuscurrent: r.statuscurrent || "",
      originaladdress1: r.originaladdress1 || "Address unavailable",
      originalzip: r.originalzip || "",
      housingunitsadded: toInt(r.housingunitsadded),
      housingunitsremoved: toInt(r.housingunitsremoved),
      estprojectcost: toInt(r.estprojectcost),
      applieddate: (r.applieddate || "").slice(0, 10),
      issueddate: (r.issueddate || "").slice(0, 10),
      latitude: Number(r.latitude) || 0,
      longitude: Number(r.longitude) || 0,
      description: r.description || "",
      link: typeof r.link === "string" ? r.link : (r.link?.url || "")
    }));
  }

  if (luApplied.length) updated.landUsePermits.byAppliedYear = normalizeYearRows(luApplied);
  if (luIssued.length) updated.landUsePermits.byIssuedYear = normalizeYearRows(luIssued);
  if (luStatus.length) {
    updated.landUsePermits.byStatus = luStatus
      .filter((r) => r.status)
      .map((r) => ({
        status: r.status,
        cnt: toInt(r.cnt),
        units_added: toInt(r.units_added),
        units_removed: toInt(r.units_removed)
      }));
  }

  return updated;
}

export async function runPresetSoqlQuery(preset, token = "") {
  if (preset === "latest_housing") {
    const rows = await fetchSoql(ENDPOINTS.building, {
      $select: "permitnum, originaladdress1, permitclass, statuscurrent, housingunitsadded, issueddate, link",
      $where: "issueddate IS NOT NULL AND housingunitsadded > 0 AND permittypemapped = 'Building'",
      $order: "issueddate DESC",
      $limit: "12"
    }, token);
    return {
      label: "Latest 12 issued housing building permits (76t5-zqzr)",
      rows: rows.map((r) => ({
        permitnum: r.permitnum,
        address: r.originaladdress1 || "Seattle",
        meta: `${r.permitclass || "Residential"} / ${r.statuscurrent || "Issued"}`,
        units: toInt(r.housingunitsadded),
        date: (r.issueddate || "").slice(0, 10),
        link: typeof r.link === "string" ? r.link : (r.link?.url || "")
      }))
    };
  }

  if (preset === "latest_middle") {
    const rows = await fetchSoql(ENDPOINTS.building, {
      $select: "permitnum, originaladdress1, housingcategory, statuscurrent, housingunitsadded, applieddate, link",
      $where: "applieddate IS NOT NULL AND housingcategory IN ('Middle Housing','Pre-Approved DADU Plans')",
      $order: "applieddate DESC",
      $limit: "12"
    }, token);
    return {
      label: "Latest 12 Middle Housing & DADU filings (76t5-zqzr)",
      rows: rows.map((r) => ({
        permitnum: r.permitnum,
        address: r.originaladdress1 || "Seattle",
        meta: `${r.housingcategory || "Middle Housing"} / ${r.statuscurrent || ""}`,
        units: toInt(r.housingunitsadded),
        date: (r.applieddate || "").slice(0, 10),
        link: typeof r.link === "string" ? r.link : (r.link?.url || "")
      }))
    };
  }

  const rows = await fetchSoql(ENDPOINTS.landuse, {
    $select: "permitnum, originaladdress1, permitclass, statuscurrent, housingunitsadded, decisiondate, link",
    $where: "decisiondate IS NOT NULL AND decisiondate >= '2025-01-01'",
    $order: "decisiondate DESC",
    $limit: "12"
  }, token);
  return {
    label: "Latest 12 Land Use MUP decisions (ht3q-kdvx)",
    rows: rows.map((r) => ({
      permitnum: r.permitnum,
      address: r.originaladdress1 || "Seattle",
      meta: `${r.permitclass || "MUP"} / ${r.statuscurrent || ""}`,
      units: toInt(r.housingunitsadded),
      date: (r.decisiondate || "").slice(0, 10),
      link: typeof r.link === "string" ? r.link : (r.link?.url || "")
    }))
  };
}

export async function fetchPermitsForYear({ dataset, year, dateBasis, token = "" }) {
  const yr = Number(year);
  if (dataset === "landuse") {
    const col = dateBasis === "applied" ? "applieddate" : "issueddate";
    const rows = await fetchSoql(ENDPOINTS.landuse, {
      $select: "permitnum, originaladdress1, originalzip, permitclass, permittypemapped, statuscurrent, housingunitsadded, housingunitsremoved, estprojectcost, applieddate, decisiondate, issueddate, latitude, longitude, description, link",
      $where: `${col} >= '${yr}-01-01' AND ${col} <= '${yr}-12-31' AND housingunitsadded > 0`,
      $order: "housingunitsadded DESC",
      $limit: "10"
    }, token);
    return rows.map((r) => ({
      permitnum: r.permitnum || "",
      originaladdress1: r.originaladdress1 || "Seattle",
      originalzip: r.originalzip || "",
      permitclass: r.permitclass || "Multifamily",
      permittypemapped: r.permittypemapped || "Master Use Permit",
      statuscurrent: r.statuscurrent || "",
      housingunitsadded: toInt(r.housingunitsadded),
      housingunitsremoved: toInt(r.housingunitsremoved),
      estprojectcost: toInt(r.estprojectcost),
      applieddate: (r.applieddate || "").slice(0, 10),
      decisiondate: (r.decisiondate || "").slice(0, 10),
      issueddate: (r.issueddate || "").slice(0, 10),
      latitude: Number(r.latitude) || 0,
      longitude: Number(r.longitude) || 0,
      description: r.description || "",
      link: typeof r.link === "string" ? r.link : (r.link?.url || "")
    }));
  }

  if (dataset === "trade") {
    const col = dateBasis === "applied" ? "applieddate" : "issueddate";
    const rows = await fetchSoql(ENDPOINTS.trade, {
      $select: "permitnum, originaladdress1, originalzip, permitclass, permittypemapped, statuscurrent, estprojectcost, applieddate, issueddate, description, link",
      $where: `${col} >= '${yr}-01-01' AND ${col} <= '${yr}-12-31'`,
      $order: `${col} DESC`,
      $limit: "10"
    }, token);
    return rows.map((r) => ({
      permitnum: r.permitnum || "",
      originaladdress1: r.originaladdress1 || "Seattle",
      originalzip: r.originalzip || "",
      permitclass: r.permitclass || "Trade",
      permittypemapped: r.permittypemapped || "Trade",
      statuscurrent: r.statuscurrent || "",
      housingunitsadded: 0,
      housingunitsremoved: 0,
      estprojectcost: toInt(r.estprojectcost),
      applieddate: (r.applieddate || "").slice(0, 10),
      issueddate: (r.issueddate || "").slice(0, 10),
      description: r.description || "",
      link: typeof r.link === "string" ? r.link : (r.link?.url || "")
    }));
  }

  const col = dateBasis === "applied" ? "applieddate" : "issueddate";
  const rows = await fetchSoql(ENDPOINTS.building, {
    $select: "permitnum, originaladdress1, originalzip, permitclass, permittypemapped, statuscurrent, housingunitsadded, housingunitsremoved, estprojectcost, applieddate, issueddate, latitude, longitude, description, link",
    $where: `${col} >= '${yr}-01-01T00:00:00' AND ${col} <= '${yr}-12-31T23:59:59' AND permittypemapped = 'Building' AND housingunitsadded > 0`,
    $order: "housingunitsadded DESC",
    $limit: "10"
  }, token);
  return rows.map((r) => ({
    permitnum: r.permitnum || "",
    originaladdress1: r.originaladdress1 || "Seattle",
    originalzip: r.originalzip || "",
    permitclass: r.permitclass || "Multifamily",
    permittypemapped: r.permittypemapped || "Building",
    statuscurrent: r.statuscurrent || "",
    housingunitsadded: toInt(r.housingunitsadded),
    housingunitsremoved: toInt(r.housingunitsremoved),
    estprojectcost: toInt(r.estprojectcost),
    applieddate: (r.applieddate || "").slice(0, 10),
    issueddate: (r.issueddate || "").slice(0, 10),
    latitude: Number(r.latitude) || 0,
    longitude: Number(r.longitude) || 0,
    description: r.description || "",
    link: typeof r.link === "string" ? r.link : (r.link?.url || "")
  }));
}

export async function fetchPermitByNum(permitnum, token = "") {
  const safe = String(permitnum || "").replace(/'/g, "");
  if (!safe) return null;
  const rows = await fetchSoql(ENDPOINTS.building, {
    $select: "permitnum, originaladdress1, originalzip, permitclass, permittypemapped, statuscurrent, housingunitsadded, housingunitsremoved, estprojectcost, applieddate, issueddate, latitude, longitude, description, link",
    $where: `permitnum = '${safe}'`,
    $limit: "1"
  }, token);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    permitnum: r.permitnum || safe,
    originaladdress1: r.originaladdress1 || "Seattle",
    originalzip: r.originalzip || "",
    permitclass: r.permitclass || "Multifamily",
    permittypemapped: r.permittypemapped || "Building",
    statuscurrent: r.statuscurrent || "",
    housingunitsadded: toInt(r.housingunitsadded),
    housingunitsremoved: toInt(r.housingunitsremoved),
    estprojectcost: toInt(r.estprojectcost),
    applieddate: (r.applieddate || "").slice(0, 10),
    issueddate: (r.issueddate || "").slice(0, 10),
    latitude: Number(r.latitude) || 0,
    longitude: Number(r.longitude) || 0,
    description: r.description || "",
    link: typeof r.link === "string" ? r.link : (r.link?.url || "")
  };
}
