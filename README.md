# Seattle Housing Permits Information

Live civic analytics tracking Seattle housing production, land use Master Use Permits (MUPs), trade permits, construction timelines, and active residential pipelines from the City of Seattle Open Data Portal (`data.seattle.gov`).

**Live site:** https://seattlepermits.org/
**3D Isometric Density Atlas:** https://seattlepermits.org/atlas3d
**Live permit feed & API bench:** https://seattlepermits.org/feed

## What It Tracks

- **3D Isometric Permit & Density Atlas (`/atlas3d`):** Low-compute, on-demand Three.js orthographic isometric model comparing active SDCI housing permit clusters against One Seattle Plan (2026) Regional and Urban Center height ceilings, HB 1110 middle-housing eligibility, Link Light Rail corridors, and an interactive zoned buildout simulator.

- **Active Housing Construction Pipeline:** Authorized units across `Issued` and `Phase Issued` building permits alongside open pre-issuance review phases and Seattle's largest active multifamily projects.
- **Permit Review & Construction Timelines (2016 to 2026):** Mean, median, 75th, and 90th percentile durations calculated across 72,319 issued building permits and 6,445 land use permits, broken down across Single Family Standalone + Townhomes, Multifamily / Apartment buildings, and Business buildings.
- **Historical Averages (2014 to 2026):** Annual housing units added vs removed, permit counts, and estimated project valuations compared against the 10-year historical average.
- **Interactive Seattle Map & ZIP Breakdown:** Spatial distribution of active housing sites across Seattle neighborhoods with on-demand live SDCI record inspection.
- **Live Socrata Open Data Sync:** Browser-side CORS queries against City of Seattle SODA endpoints (`76t5-zqzr`, `ht3q-kdvx`, `c87v-5hwh`).

## Machine-Readable & LLM Endpoints

- Concise LLM index: https://seattlepermits.org/llms.txt
- Full Markdown data reference: https://seattlepermits.org/llms-full.txt
- Structured JSON summary: https://seattlepermits.org/data/seattle-permits-summary.json
- XML Sitemap: https://seattlepermits.org/sitemap.xml

## Local Development

No build step required (pure HTML, CSS, and ES Modules):

```bash
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765/.

## Data Source

City of Seattle Department of Construction and Inspections (SDCI) via [data.seattle.gov](https://data.seattle.gov):
- Building Permits (`76t5-zqzr`)
- Land Use Permits (`ht3q-kdvx`)
- Trade Permits (`c87v-5hwh`)
