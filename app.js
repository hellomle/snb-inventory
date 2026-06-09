const STORAGE_KEYS = {
  csv: "shopifyInventoryDashboard.csv",
  source: "shopifyInventoryDashboard.source",
  reorder: "shopifyInventoryDashboard.reorderThreshold",
  watchlist: "shopifyInventoryDashboard.watchlistThreshold"
};

const DEFAULT_REORDER_THRESHOLD = 5;
const DEFAULT_WATCHLIST_THRESHOLD = 10;
const DEFAULT_LOCATION = "Not listed";

const state = {
  rows: [],
  processedRows: [],
  sourceName: "",
  reorderThreshold: DEFAULT_REORDER_THRESHOLD,
  watchlistThreshold: DEFAULT_WATCHLIST_THRESHOLD,
  search: "",
  statusFilter: "All",
  locationFilter: "All"
};

const els = {
  upload: document.getElementById("csvUpload"),
  clearSaved: document.getElementById("clearSaved"),
  dataSource: document.getElementById("dataSource"),
  reorderThreshold: document.getElementById("reorderThreshold"),
  watchlistThreshold: document.getElementById("watchlistThreshold"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  locationFilter: document.getElementById("locationFilter"),
  downloadCsv: document.getElementById("downloadCsv"),
  actionBody: document.getElementById("actionBody"),
  inventoryBody: document.getElementById("inventoryBody"),
  emptyActions: document.getElementById("emptyActions"),
  emptyInventory: document.getElementById("emptyInventory"),
  kpis: {
    rows: document.getElementById("kpiRows"),
    available: document.getElementById("kpiAvailable"),
    onHand: document.getElementById("kpiOnHand"),
    out: document.getElementById("kpiOut"),
    reorder: document.getElementById("kpiReorder"),
    watchlist: document.getElementById("kpiWatchlist"),
    healthy: document.getElementById("kpiHealthy"),
    incoming: document.getElementById("kpiIncoming")
  }
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const cleanText = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < cleanText.length; index += 1) {
    const char = cleanText[index];
    const nextChar = cleanText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((cell) => String(cell).trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => String(header || "").trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] === undefined ? "" : cells[index];
    });
    return record;
  });
}

function compact(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getValue(record, candidates, fallback = "") {
  const headerMap = new Map();
  Object.keys(record).forEach((header) => {
    headerMap.set(compact(header), header);
  });

  for (const candidate of candidates) {
    const key = compact(candidate);
    if (headerMap.has(key)) {
      return record[headerMap.get(key)];
    }
  }

  for (const candidate of candidates) {
    const key = compact(candidate);
    const match = [...headerMap.keys()].find((header) => header.startsWith(key) || key.startsWith(header));
    if (match) {
      return record[headerMap.get(match)];
    }
  }

  return fallback;
}

function toNumber(value) {
  const cleaned = String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, "");
  const number = Number.parseFloat(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function buildVariantName(record) {
  const values = [
    getValue(record, ["Option1 Value"]),
    getValue(record, ["Option2 Value"]),
    getValue(record, ["Option3 Value"])
  ]
    .map((value) => String(value || "").trim())
    .filter((value) => value && value.toLowerCase() !== "default title");

  return values.join(" / ");
}

function normalizeRows(records) {
  let lastTitle = "";
  let lastHandle = "";

  return records.map((record) => {
    const rawTitle = String(getValue(record, ["Title", "Product title", "Product"], "")).trim();
    const rawHandle = String(getValue(record, ["Handle"], "")).trim();
    lastTitle = rawTitle || lastTitle;
    lastHandle = rawHandle || lastHandle;

    const available = toNumber(getValue(record, [
      "Available",
      "Available (not editable)",
      "Available quantity",
      "Variant Inventory Qty",
      "Inventory Qty"
    ]));
    const onHandRaw = getValue(record, [
      "On hand",
      "On hand (current)",
      "On hand (new)",
      "On-hand",
      "Inventory on hand"
    ], "");
    const incoming = toNumber(getValue(record, ["Incoming", "Incoming (not editable)"]));
    const committed = toNumber(getValue(record, ["Committed", "Committed (not editable)"]));
    const unavailable = toNumber(getValue(record, ["Unavailable", "Unavailable (not editable)"]));

    return {
      title: lastTitle || lastHandle || "Untitled product",
      variant: buildVariantName(record),
      sku: String(getValue(record, ["SKU", "Variant SKU", "Variant Sku"], "")).trim(),
      location: String(getValue(record, ["Location", "Location name"], DEFAULT_LOCATION)).trim() || DEFAULT_LOCATION,
      available,
      onHand: onHandRaw === "" ? available : toNumber(onHandRaw),
      committed,
      incoming,
      unavailable,
      hsCode: String(getValue(record, ["HS Code", "Harmonized System Code", "Variant HS Code"], "")).trim(),
      coo: String(getValue(record, ["COO", "Country of origin", "Country/Region of origin"], "")).trim()
    };
  });
}

function getStatus(row) {
  if (row.available <= 0) {
    return "Out of Stock";
  }
  if (row.available <= state.reorderThreshold) {
    return "Reorder";
  }
  if (row.available <= state.watchlistThreshold) {
    return "Watchlist";
  }
  return "Healthy";
}

function getRecommendedAction(status) {
  if (status === "Out of Stock") {
    return "Review / restock";
  }
  if (status === "Reorder") {
    return "Reorder soon";
  }
  if (status === "Watchlist") {
    return "Monitor";
  }
  return "No action needed";
}

function enrichRows() {
  state.processedRows = state.rows.map((row) => {
    const status = getStatus(row);
    return {
      ...row,
      status,
      recommendedAction: getRecommendedAction(status)
    };
  });
}

function numberFormat(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, "-")}`;
}

function renderKpis() {
  const counts = state.processedRows.reduce((totals, row) => {
    totals.available += row.available;
    totals.onHand += row.onHand;
    totals.incoming += row.incoming;
    totals[row.status] = (totals[row.status] || 0) + 1;
    return totals;
  }, { available: 0, onHand: 0, incoming: 0 });

  els.kpis.rows.textContent = numberFormat(state.processedRows.length);
  els.kpis.available.textContent = numberFormat(counts.available);
  els.kpis.onHand.textContent = numberFormat(counts.onHand);
  els.kpis.out.textContent = numberFormat(counts["Out of Stock"] || 0);
  els.kpis.reorder.textContent = numberFormat(counts.Reorder || 0);
  els.kpis.watchlist.textContent = numberFormat(counts.Watchlist || 0);
  els.kpis.healthy.textContent = numberFormat(counts.Healthy || 0);
  els.kpis.incoming.textContent = numberFormat(counts.incoming);
}

function renderLocations() {
  const current = els.locationFilter.value;
  const locations = [...new Set(state.processedRows.map((row) => row.location).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  els.locationFilter.innerHTML = `<option value="All">All locations</option>${locations.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join("")}`;
  els.locationFilter.value = locations.includes(current) ? current : "All";
  state.locationFilter = els.locationFilter.value;
}

function rowMatchesFilters(row) {
  const term = state.search.trim().toLowerCase();
  const matchesSearch = !term || row.title.toLowerCase().includes(term) || row.sku.toLowerCase().includes(term);
  const matchesStatus = state.statusFilter === "All" || row.status === state.statusFilter;
  const matchesLocation = state.locationFilter === "All" || row.location === state.locationFilter;
  return matchesSearch && matchesStatus && matchesLocation;
}

function renderActionList() {
  const priority = { "Out of Stock": 1, Reorder: 2, Watchlist: 3, Healthy: 4 };
  const rows = state.processedRows
    .filter((row) => row.status !== "Healthy")
    .sort((a, b) => priority[a.status] - priority[b.status] || a.available - b.available || a.title.localeCompare(b.title));

  els.actionBody.innerHTML = rows.map((row) => `
    <tr>
      <td><span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.variant)}</td>
      <td>${escapeHtml(row.sku)}</td>
      <td>${escapeHtml(row.location)}</td>
      <td>${numberFormat(row.available)}</td>
      <td>${numberFormat(row.onHand)}</td>
      <td>${numberFormat(row.incoming)}</td>
      <td>${escapeHtml(row.recommendedAction)}</td>
    </tr>
  `).join("");

  els.emptyActions.classList.toggle("is-visible", rows.length === 0);
}

function renderInventoryTable() {
  const rows = state.processedRows.filter(rowMatchesFilters);

  els.inventoryBody.innerHTML = rows.map((row) => `
    <tr>
      <td><span class="status-pill ${statusClass(row.status)}">${escapeHtml(row.status)}</span></td>
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.variant)}</td>
      <td>${escapeHtml(row.sku)}</td>
      <td>${escapeHtml(row.location)}</td>
      <td>${numberFormat(row.available)}</td>
      <td>${numberFormat(row.onHand)}</td>
      <td>${numberFormat(row.committed)}</td>
      <td>${numberFormat(row.incoming)}</td>
      <td>${numberFormat(row.unavailable)}</td>
      <td>${escapeHtml(row.hsCode)}</td>
      <td>${escapeHtml(row.coo)}</td>
    </tr>
  `).join("");

  els.emptyInventory.textContent = state.processedRows.length === 0
    ? "Upload a Shopify inventory CSV to get started."
    : "No inventory rows match the current filters.";
  els.emptyInventory.classList.toggle("is-visible", rows.length === 0);
}

function renderSource() {
  if (!state.sourceName) {
    els.dataSource.textContent = "No CSV loaded yet.";
    return;
  }
  els.dataSource.textContent = `Showing data from ${state.sourceName}.`;
}

function render() {
  enrichRows();
  renderSource();
  renderKpis();
  renderLocations();
  renderActionList();
  renderInventoryTable();
  els.downloadCsv.disabled = state.processedRows.length === 0;
}

function loadCsvText(text, sourceName, shouldSave = false) {
  const parsed = parseCsv(text);
  state.rows = normalizeRows(parsed);
  state.sourceName = sourceName;

  if (shouldSave) {
    localStorage.setItem(STORAGE_KEYS.csv, text);
    localStorage.setItem(STORAGE_KEYS.source, sourceName);
  }

  render();
}

function setThresholdsFromInputs() {
  const reorder = Math.max(0, Math.floor(toNumber(els.reorderThreshold.value)));
  const watchlist = Math.max(reorder, Math.floor(toNumber(els.watchlistThreshold.value)));
  state.reorderThreshold = reorder;
  state.watchlistThreshold = watchlist;
  els.reorderThreshold.value = String(reorder);
  els.watchlistThreshold.value = String(watchlist);
  localStorage.setItem(STORAGE_KEYS.reorder, String(reorder));
  localStorage.setItem(STORAGE_KEYS.watchlist, String(watchlist));
  render();
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadProcessedCsv() {
  const headers = [
    "Status",
    "Recommended Action",
    "Product title",
    "Variant name",
    "SKU",
    "Location",
    "Available",
    "On hand",
    "Committed",
    "Incoming",
    "Unavailable",
    "HS Code",
    "COO"
  ];

  const lines = [
    headers.join(","),
    ...state.processedRows.map((row) => [
      row.status,
      row.recommendedAction,
      row.title,
      row.variant,
      row.sku,
      row.location,
      row.available,
      row.onHand,
      row.committed,
      row.incoming,
      row.unavailable,
      row.hsCode,
      row.coo
    ].map(csvEscape).join(","))
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "processed_inventory_dashboard.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadSavedSettings() {
  const savedReorder = localStorage.getItem(STORAGE_KEYS.reorder);
  const savedWatchlist = localStorage.getItem(STORAGE_KEYS.watchlist);
  state.reorderThreshold = savedReorder === null ? DEFAULT_REORDER_THRESHOLD : Math.max(0, Math.floor(toNumber(savedReorder)));
  state.watchlistThreshold = savedWatchlist === null ? DEFAULT_WATCHLIST_THRESHOLD : Math.max(state.reorderThreshold, Math.floor(toNumber(savedWatchlist)));
  els.reorderThreshold.value = String(state.reorderThreshold);
  els.watchlistThreshold.value = String(state.watchlistThreshold);
}

async function loadInitialData() {
  const savedCsv = localStorage.getItem(STORAGE_KEYS.csv);
  const savedSource = localStorage.getItem(STORAGE_KEYS.source);

  if (savedCsv) {
    loadCsvText(savedCsv, savedSource || "saved upload", false);
    return;
  }

  try {
    const response = await fetch("data/inventory_export.csv", { cache: "no-store" });
    if (response.ok) {
      const text = await response.text();
      loadCsvText(text, "sample inventory_export.csv", false);
      return;
    }
  } catch (error) {
    // The sample file may not load when the page is opened directly from disk.
  }

  render();
}

els.upload.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  const text = await file.text();
  loadCsvText(text, file.name, true);
  els.upload.value = "";
});

els.clearSaved.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEYS.csv);
  localStorage.removeItem(STORAGE_KEYS.source);
  state.rows = [];
  state.sourceName = "";
  render();
});

els.reorderThreshold.addEventListener("input", setThresholdsFromInputs);
els.watchlistThreshold.addEventListener("input", setThresholdsFromInputs);

els.searchInput.addEventListener("input", () => {
  state.search = els.searchInput.value;
  renderInventoryTable();
});

els.statusFilter.addEventListener("change", () => {
  state.statusFilter = els.statusFilter.value;
  renderInventoryTable();
});

els.locationFilter.addEventListener("change", () => {
  state.locationFilter = els.locationFilter.value;
  renderInventoryTable();
});

els.downloadCsv.addEventListener("click", downloadProcessedCsv);

loadSavedSettings();
loadInitialData();
