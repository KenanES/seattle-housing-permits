// Shared Seattle permit hotspots, One Seattle Plan (2026) theoretical density zones,
// Link Light Rail corridors, arterial roads, major parks, and story stops for the 3D Atlas.
import { SEATTLE_SNAPSHOT } from "../data/seattle-snapshot.js";

const TOP_LOOKUP = new Map(
  SEATTLE_SNAPSHOT.buildingPermits.top25BuildingActive.map((p) => [p.permitnum, p])
);

const ZIP_LOOKUP = new Map(
  SEATTLE_SNAPSHOT.buildingPermits.activeByZip.map((z) => [z.zip, z])
);

export function classifyStatus(status) {
  if (status === "Issued" || status === "Phase Issued") return "issued";
  if (status === "Approved to Occupy" || status === "Ready for Issuance" || status === "Reviews Completed") return "ready";
  return "review";
}

export const PERMIT_POINTS = SEATTLE_SNAPSHOT.buildingPermits.mapPoints.map((item) => {
  const { permitnum, lat, lng, units, status, permitclass, zip } = Array.isArray(item)
    ? {
        permitnum: item[0],
        lat: item[1],
        lng: item[2],
        units: item[3],
        status: item[4],
        permitclass: item[5],
        zip: item[6]
      }
    : item;
  const rich = TOP_LOOKUP.get(permitnum);
  const zipInfo = ZIP_LOOKUP.get(zip);
  const stage = classifyStatus(status);
  return {
    permitnum,
    lat,
    lng,
    units,
    status,
    stage,
    permitclass,
    zip,
    neighborhood: zipInfo ? zipInfo.neighborhood : "Seattle",
    address: rich ? rich.originaladdress1 : `ZIP ${zip} active site`,
    estCost: rich ? rich.estprojectcost : null,
    appliedDate: rich ? rich.applieddate : null,
    issuedDate: rich ? rich.issueddate : null,
    description: rich
      ? rich.description
      : `${permitclass} housing permit (${units} gross units) currently ${status}.`,
    link: rich
      ? rich.link
      : `https://services.seattle.gov/portal/customize/LinkToRecord.aspx?altId=${encodeURIComponent(permitnum)}`
  };
});

// Adopted One Seattle Plan (effective Jan 21, 2026) Regional & Urban Centers
// with representative maximum zoning heights (feet), theoretical net unit headroom,
// and active permit volume from verified SDCI ZIP data.
export const DENSITY_ZONES = [
  {
    id: "downtown",
    name: "Downtown / Denny Triangle",
    shortName: "Downtown",
    tier: "Regional Center",
    zoningCode: "DOC1 U/450-U, DMC 240-440",
    maxHeightFt: 480,
    maxFar: "14.0 to 20.0",
    lat: 47.6115,
    lng: -122.3365,
    widthDegLng: 0.0175,
    heightDegLat: 0.0155,
    activeUnits: 13402,
    theoreticalCapacity: 42000,
    transitNote: "Link 1 & 2 Line hub (Westlake, Symphony, Pioneer Sq, CID)",
    highlight: "Highest allowable height in Seattle (unlimited/450+ ft core), combining active towers with substantial remaining tower-zoned lots."
  },
  {
    id: "slu",
    name: "South Lake Union",
    shortName: "SLU",
    tier: "Regional Center",
    zoningCode: "SM-SLU 85-240 / 400",
    maxHeightFt: 260,
    maxFar: "6.0 to 10.0",
    lat: 47.6242,
    lng: -122.3372,
    widthDegLng: 0.0155,
    heightDegLat: 0.0095,
    activeUnits: 5258,
    theoreticalCapacity: 18500,
    transitNote: "SLU Streetcar + RapidRide + future Ballard Link station",
    highlight: "Dense mid-rise and high-rise job center with 5,258 active housing units and further infill room along Aurora and Westlake."
  },
  {
    id: "first-capitol-hill",
    name: "First Hill / Capitol Hill",
    shortName: "Capitol Hill",
    tier: "Regional Center",
    zoningCode: "HR 160-440, NC3-75/95",
    maxHeightFt: 340,
    maxFar: "8.0 to 13.0",
    lat: 47.6140,
    lng: -122.3205,
    widthDegLng: 0.0150,
    heightDegLat: 0.0165,
    activeUnits: 8976,
    theoreticalCapacity: 26000,
    transitNote: "Capitol Hill Link 1 Line + First Hill Streetcar + RapidRide G",
    highlight: "High-rise residential zoning along First Hill paired with active transit-oriented mid-rise infill."
  },
  {
    id: "u-district",
    name: "University District",
    shortName: "U-District",
    tier: "Regional Center",
    zoningCode: "SM-U 75-320",
    maxHeightFt: 320,
    maxFar: "9.0 to 12.0",
    lat: 47.6615,
    lng: -122.3135,
    widthDegLng: 0.0155,
    heightDegLat: 0.0125,
    activeUnits: 6685,
    theoreticalCapacity: 24500,
    transitNote: "U District & UW Link 1 Line stations",
    highlight: "Seattle's #1 ZIP for active housing units (98105), propelled by the 320 ft Link station upzone with major parcels still unbuilt."
  },
  {
    id: "northgate",
    name: "Northgate",
    shortName: "Northgate",
    tier: "Regional Center",
    zoningCode: "SM-NG 125-240 (One Seattle 2026)",
    maxHeightFt: 240,
    maxFar: "7.0",
    lat: 47.7055,
    lng: -122.3250,
    widthDegLng: 0.0165,
    heightDegLat: 0.0115,
    activeUnits: 2937,
    theoreticalCapacity: 22000,
    transitNote: "Northgate Link 1 Line station + regional bus transit center",
    highlight: "One of Seattle's largest untapped housing opportunities: newly elevated Regional Center with 240 ft tower zoning around surface parking and mall parcels."
  },
  {
    id: "ballard",
    name: "Ballard",
    shortName: "Ballard",
    tier: "Regional Center",
    zoningCode: "NC3-75 to 125, SM-B (One Seattle 2026)",
    maxHeightFt: 145,
    maxFar: "5.5 to 6.5",
    lat: 47.6690,
    lng: -122.3820,
    widthDegLng: 0.0170,
    heightDegLat: 0.0095,
    activeUnits: 4660,
    theoreticalCapacity: 17500,
    transitNote: "RapidRide D + future Ballard Link station",
    highlight: "Elevated to Regional Center under the One Seattle Plan; strong mid-rise activity along Market St with substantial new height headroom."
  },
  {
    id: "uptown",
    name: "Uptown / Lower Queen Anne",
    shortName: "Uptown",
    tier: "Regional Center",
    zoningCode: "SM-UP 85-160",
    maxHeightFt: 160,
    maxFar: "5.0 to 7.0",
    lat: 47.6245,
    lng: -122.3565,
    widthDegLng: 0.0135,
    heightDegLat: 0.0085,
    activeUnits: 1312,
    theoreticalCapacity: 11500,
    transitNote: "Monorail, RapidRide D, future Seattle Center Link",
    highlight: "High-capacity arena district with 160 ft height limits and far less current construction than neighboring SLU."
  },
  {
    id: "ne-130th",
    name: "NE 130th St Station",
    shortName: "NE 130th",
    tier: "Urban Center",
    zoningCode: "NC3-85 / SM-85 (New 2026 Hub)",
    maxHeightFt: 105,
    maxFar: "4.5 to 5.5",
    lat: 47.7235,
    lng: -122.3220,
    widthDegLng: 0.0145,
    heightDegLat: 0.0095,
    activeUnits: 620,
    theoreticalCapacity: 11000,
    transitNote: "New Pinehurst / NE 130th Link 1 Line infill station",
    highlight: "Highest percentage untapped capacity in Seattle: a brand-new Link station surrounded by newly upzoned low-rise land."
  },
  {
    id: "roosevelt",
    name: "Roosevelt",
    shortName: "Roosevelt",
    tier: "Urban Center",
    zoningCode: "NC3-95, MR",
    maxHeightFt: 95,
    maxFar: "4.5 to 5.5",
    lat: 47.6775,
    lng: -122.3175,
    widthDegLng: 0.0115,
    heightDegLat: 0.0085,
    activeUnits: 3301,
    theoreticalCapacity: 9200,
    transitNote: "Roosevelt Link 1 Line station",
    highlight: "Active Link 1 Line hub with 8-story mixed-use capacity around NE 65th St and Roosevelt Way."
  },
  {
    id: "fremont-wallingford",
    name: "Fremont / Stone Way",
    shortName: "Fremont",
    tier: "Urban Center",
    zoningCode: "NC3-65 / 75, IC-65",
    maxHeightFt: 75,
    maxFar: "4.25",
    lat: 47.6545,
    lng: -122.3470,
    widthDegLng: 0.0165,
    heightDegLat: 0.0085,
    activeUnits: 6277,
    theoreticalCapacity: 11800,
    transitNote: "RapidRide E + Aurora & Stone Way frequent transit",
    highlight: "Seattle's #2 ZIP for active units (98103), with high townhome and 6-to-7-story apartment buildout already underway."
  },
  {
    id: "mt-baker",
    name: "Mt Baker / Judkins Park",
    shortName: "Mt Baker",
    tier: "Urban Center",
    zoningCode: "NC3-85 / 95, MR",
    maxHeightFt: 95,
    maxFar: "5.0",
    lat: 47.5815,
    lng: -122.3015,
    widthDegLng: 0.0145,
    heightDegLat: 0.0125,
    activeUnits: 4529,
    theoreticalCapacity: 14500,
    transitNote: "Mt Baker Link 1 Line + Judkins Park Link 2 Line",
    highlight: "Dual Link 1 and 2 Line convergence creating nearly 10,000 units of remaining transit-oriented apartment capacity."
  },
  {
    id: "columbia-othello",
    name: "Columbia City / Othello",
    shortName: "Rainier Valley",
    tier: "Urban Center",
    zoningCode: "NC3-75 / 85",
    maxHeightFt: 85,
    maxFar: "4.5 to 5.5",
    lat: 47.5475,
    lng: -122.2835,
    widthDegLng: 0.0155,
    heightDegLat: 0.0165,
    activeUnits: 5911,
    theoreticalCapacity: 18000,
    transitNote: "Columbia City, Othello, and Rainier Beach Link 1 Line",
    highlight: "Rainier Valley combines strong active permitting (5,911 units) with 12,000+ units of remaining corridor capacity along MLK Jr Way S."
  },
  {
    id: "west-seattle-jct",
    name: "West Seattle Junction",
    shortName: "West Seattle",
    tier: "Urban Center",
    zoningCode: "NC3-85, MR (Future Link Hub)",
    maxHeightFt: 95,
    maxFar: "5.0",
    lat: 47.5615,
    lng: -122.3865,
    widthDegLng: 0.0145,
    heightDegLat: 0.0105,
    activeUnits: 1010,
    theoreticalCapacity: 12500,
    transitNote: "RapidRide C & H + future West Seattle Link extension",
    highlight: "High theoretical ceiling ahead of future West Seattle Link rail, with only 8% of zoned capacity currently permitted."
  },
  {
    id: "lake-city",
    name: "Lake City",
    shortName: "Lake City",
    tier: "Urban Center",
    zoningCode: "NC3-75",
    maxHeightFt: 75,
    maxFar: "4.5",
    lat: 47.7215,
    lng: -122.2930,
    widthDegLng: 0.0135,
    heightDegLat: 0.0085,
    activeUnits: 1450,
    theoreticalCapacity: 8600,
    transitNote: "Frequent bus corridor along Lake City Way NE",
    highlight: "Underbuilt northeast commercial corridor with expanded 75 ft mixed-use envelope and deep parcel lots."
  },
  {
    id: "bitter-lake",
    name: "Bitter Lake / Aurora N",
    shortName: "Bitter Lake",
    tier: "Urban Center",
    zoningCode: "NC3-75",
    maxHeightFt: 75,
    maxFar: "4.5",
    lat: 47.7265,
    lng: -122.3455,
    widthDegLng: 0.0125,
    heightDegLat: 0.0095,
    activeUnits: 2186,
    theoreticalCapacity: 9400,
    transitNote: "RapidRide E Line along Aurora Ave N",
    highlight: "Large-format commercial parcels along Aurora Ave N converting into 250-to-380-unit apartment buildings."
  }
].map((z) => {
  const gapUnits = Math.max(0, z.theoreticalCapacity - z.activeUnits);
  const utilizationPct = Math.min(100, Math.round((z.activeUnits / z.theoreticalCapacity) * 100));
  const untappedPct = 100 - utilizationPct;
  const opportunityTier = utilizationPct <= 22 ? "high" : utilizationPct <= 42 ? "medium" : "active";
  return {
    ...z,
    gapUnits,
    utilizationPct,
    untappedPct,
    opportunityTier,
    maxHeightMeters: Number((z.maxHeightFt * 0.3048).toFixed(1))
  };
});

export const LINK_1_LINE = [
  { name: "NE 130th St", lat: 47.7238, lng: -122.3238 },
  { name: "Northgate", lat: 47.7022, lng: -122.3282 },
  { name: "Roosevelt", lat: 47.6764, lng: -122.3162 },
  { name: "U District", lat: 47.6602, lng: -122.3143 },
  { name: "Univ. of Washington", lat: 47.6496, lng: -122.3037 },
  { name: "Capitol Hill", lat: 47.6196, lng: -122.3204 },
  { name: "Westlake", lat: 47.6114, lng: -122.3375 },
  { name: "Symphony", lat: 47.6072, lng: -122.3361 },
  { name: "Pioneer Square", lat: 47.6021, lng: -122.3316 },
  { name: "Int'l District / Chinatown", lat: 47.5984, lng: -122.3279 },
  { name: "Stadium", lat: 47.5918, lng: -122.3272 },
  { name: "SODO", lat: 47.5799, lng: -122.3275 },
  { name: "Beacon Hill", lat: 47.5791, lng: -122.3113 },
  { name: "Mount Baker", lat: 47.5764, lng: -122.2977 },
  { name: "Columbia City", lat: 47.5589, lng: -122.2923 },
  { name: "Othello", lat: 47.5375, lng: -122.2815 },
  { name: "Rainier Beach", lat: 47.5223, lng: -122.2794 }
];

export const LINK_2_LINE = [
  { name: "Int'l District / Chinatown", lat: 47.5984, lng: -122.3279 },
  { name: "Judkins Park", lat: 47.5904, lng: -122.3016 },
  { name: "I-90 Lake Crossing", lat: 47.5892, lng: -122.2480 }
];

// Major Seattle corridors & bridges for instant cartographic orientation
export const SEATTLE_ROADS = [
  {
    name: "I-5",
    width: 0.17,
    color: 0xa69d8d,
    coords: [
      [47.736, -122.323], [47.706, -122.327], [47.676, -122.321], [47.652, -122.321],
      [47.624, -122.326], [47.606, -122.328], [47.585, -122.319], [47.552, -122.314],
      [47.520, -122.301], [47.496, -122.294]
    ]
  },
  {
    name: "SR-99 / Aurora",
    width: 0.12,
    color: 0xb7ae9e,
    coords: [
      [47.735, -122.345], [47.705, -122.345], [47.678, -122.345], [47.652, -122.347],
      [47.625, -122.344], [47.606, -122.337], [47.575, -122.336], [47.535, -122.334]
    ]
  },
  {
    name: "SR-520 Bridge",
    width: 0.13,
    color: 0xa69d8d,
    coords: [
      [47.643, -122.321], [47.641, -122.302], [47.640, -122.275], [47.640, -122.238]
    ]
  },
  {
    name: "I-90 Bridge",
    width: 0.15,
    color: 0xa69d8d,
    coords: [
      [47.595, -122.325], [47.590, -122.302], [47.589, -122.278], [47.589, -122.238]
    ]
  },
  {
    name: "West Seattle Bridge",
    width: 0.13,
    color: 0xa69d8d,
    coords: [
      [47.572, -122.322], [47.571, -122.346], [47.571, -122.369], [47.562, -122.386]
    ]
  },
  {
    name: "NE 45th / Market St",
    width: 0.1,
    color: 0xc2b9a8,
    coords: [
      [47.668, -122.392], [47.668, -122.372], [47.661, -122.345], [47.661, -122.313], [47.661, -122.290]
    ]
  },
  {
    name: "Rainier Ave S",
    width: 0.1,
    color: 0xc2b9a8,
    coords: [
      [47.595, -122.311], [47.577, -122.297], [47.559, -122.286], [47.537, -122.274], [47.512, -122.264]
    ]
  }
];

// Iconic Seattle green parks for neighborhood legibility
export const SEATTLE_PARKS = [
  {
    name: "Discovery Park",
    coords: [
      [47.666, -122.404], [47.662, -122.423], [47.651, -122.418], [47.651, -122.401]
    ]
  },
  {
    name: "Magnuson Park",
    coords: [
      [47.688, -122.265], [47.680, -122.250], [47.673, -122.256], [47.677, -122.268]
    ]
  },
  {
    name: "Seward Park",
    coords: [
      [47.558, -122.263], [47.557, -122.250], [47.547, -122.248], [47.548, -122.261]
    ]
  },
  {
    name: "UW Campus",
    coords: [
      [47.660, -122.311], [47.659, -122.297], [47.649, -122.297], [47.651, -122.312]
    ]
  },
  {
    name: "Volunteer Park",
    coords: [
      [47.633, -122.318], [47.633, -122.312], [47.628, -122.312], [47.628, -122.318]
    ]
  },
  {
    name: "Woodland Park",
    coords: [
      [47.673, -122.353], [47.673, -122.342], [47.665, -122.342], [47.665, -122.353]
    ]
  },
  {
    name: "Lincoln Park",
    coords: [
      [47.535, -122.397], [47.535, -122.390], [47.526, -122.390], [47.526, -122.397]
    ]
  }
];

export const STORY_STOPS = [
  {
    id: "busiest",
    badge: "1. Active Today",
    title: "Where permits cluster right now",
    summary: "Over half of active housing units concentrate in a 3-mile core from Downtown and SLU through Capitol Hill and the U-District (98105 alone leads Seattle with 6,685 active units).",
    mode: "permits",
    lat: 47.632,
    lng: -122.326,
    zoom: 1.75
  },
  {
    id: "untapped",
    badge: "2. Biggest Room to Grow",
    title: "Northgate and NE 130th Link hubs",
    summary: "Under the 2026 One Seattle Plan, newly elevated Northgate (240 ft cap) and the NE 130th Link station hold 29,400+ untapped units with less than 13% currently in the permit pipeline.",
    mode: "zoning",
    lat: 47.711,
    lng: -122.324,
    zoom: 2.1
  },
  {
    id: "frontiers",
    badge: "3. South & West Frontiers",
    title: "Rainier Valley & West Seattle infill",
    summary: "Dual Link lines at Mt Baker/Judkins Park, plus Columbia City, Othello, and future West Seattle Link, could absorb 35,000+ mid-rise homes inside 75 to 95 ft transit envelopes.",
    mode: "gap",
    buildout: 0.65,
    lat: 47.562,
    lng: -122.322,
    zoom: 1.65
  }
];

export const PLACES = [
  { id: "overview", label: "Citywide", lat: 47.624, lng: -122.326, zoom: 1.02 },
  { id: "downtown", label: "Downtown / SLU", lat: 47.616, lng: -122.336, zoom: 2.3 },
  { id: "u-district", label: "U-District", lat: 47.661, lng: -122.314, zoom: 2.3 },
  { id: "ballard", label: "Ballard", lat: 47.669, lng: -122.382, zoom: 2.3 },
  { id: "northgate", label: "Northgate & 130th", lat: 47.712, lng: -122.324, zoom: 2.0 },
  { id: "rainier", label: "Rainier Valley", lat: 47.562, lng: -122.292, zoom: 2.0 },
  { id: "west-seattle", label: "West Seattle", lat: 47.562, lng: -122.385, zoom: 2.1 }
];

export function fmtNum(n) {
  return Number(n || 0).toLocaleString("en-US");
}

// Seattle shoreline geometry (shared for Three.js diorama terrain)
export const SEATTLE_GEO_POLYGONS = {
  mainland: [
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
  ],
  westSeattle: [
    [47.594, -122.384], [47.587, -122.369], [47.574, -122.358], [47.552, -122.348],
    [47.526, -122.343], [47.501, -122.345], [47.496, -122.393], [47.515, -122.396],
    [47.536, -122.398], [47.558, -122.401], [47.576, -122.419], [47.585, -122.411]
  ],
  lakeUnion: [
    [47.649, -122.388], [47.657, -122.364], [47.651, -122.342], [47.647, -122.326],
    [47.648, -122.313], [47.645, -122.303], [47.641, -122.306], [47.641, -122.321],
    [47.630, -122.328], [47.626, -122.337], [47.634, -122.344], [47.645, -122.342],
    [47.651, -122.362], [47.663, -122.392]
  ],
  greenLake: [
    [47.683, -122.339], [47.683, -122.329], [47.676, -122.326], [47.673, -122.336],
    [47.678, -122.343]
  ],
  mercerIsland: [
    [47.591, -122.248], [47.587, -122.226], [47.555, -122.220], [47.528, -122.230],
    [47.536, -122.246], [47.565, -122.249]
  ]
};
