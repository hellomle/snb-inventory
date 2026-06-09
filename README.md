# Shopify Inventory Dashboard

A simple static web app for turning a Shopify inventory CSV export into a client-friendly inventory dashboard. It shows inventory KPIs, urgent action items, searchable inventory rows, and a processed CSV download without requiring Excel edits or a backend.

## What It Does

- Upload a Shopify inventory CSV directly in the browser.
- Recalculate inventory KPIs immediately after upload.
- Show out-of-stock, reorder, watchlist, and healthy inventory statuses.
- Let the user adjust reorder and watchlist thresholds.
- Remember the latest uploaded CSV in local browser storage.
- Download the processed table with calculated Status and Recommended Action columns.

Shopify remains the source of truth for inventory. This dashboard is a simpler view for understanding what is in stock, low stock, out of stock, or needs attention.

## Project Files

- `index.html` is the dashboard page.
- `styles.css` contains the page styling.
- `app.js` parses CSV files, calculates statuses, updates tables, stores the latest upload, and exports processed CSV data.
- `data/inventory_export.csv` is optional sample data for the initial dashboard view when served from a web server.
- `.nojekyll` helps GitHub Pages serve the files as-is.

## Run Locally

Because browsers limit some file loading when a page is opened directly from disk, run a tiny local web server from this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

You can also open `index.html` directly and upload a CSV manually.

## Upload A Shopify Inventory CSV

1. Export inventory from Shopify as a CSV.
2. Open the dashboard.
3. Select **Choose CSV**.
4. Pick the latest Shopify inventory CSV.
5. The KPIs, action list, filters, and inventory table update immediately.

The latest uploaded CSV is saved in the browser's local storage, so the dashboard remains populated after refresh on the same device and browser.

## Expected Columns

The parser is defensive and accepts slight column name differences. Common supported columns include:

- `Handle`
- `Title`
- `Option1 Name`, `Option1 Value`
- `Option2 Name`, `Option2 Value`
- `Option3 Name`, `Option3 Value`
- `SKU` or `Variant SKU`
- `HS Code`
- `COO`
- `Location`
- `Available` or `Available (not editable)`
- `On hand` or `On hand (current)`
- `Committed`
- `Incoming`
- `Unavailable`

For Shopify product exports, the dashboard also reads `Variant Inventory Qty` as available inventory when an inventory-specific `Available` column is not present.

Missing columns will not break the page. The dashboard shows blanks for text fields and zeros for missing quantity fields.

## Status Logic

Default thresholds:

- Reorder threshold: `5`
- Watchlist threshold: `10`

Statuses are calculated this way:

- Out of Stock: Available is `0` or below.
- Reorder: Available is above `0` and at or below the reorder threshold.
- Watchlist: Available is above the reorder threshold and at or below the watchlist threshold.
- Healthy: Available is above the watchlist threshold.

Recommended actions:

- Out of Stock: `Review / restock`
- Reorder: `Reorder soon`
- Watchlist: `Monitor`
- Healthy: `No action needed`

## Deploy On GitHub Pages

1. Create a GitHub repository.
2. Upload the project files to the repository root.
3. Go to **Settings > Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose the `main` branch and `/root` folder.
6. Save the settings.

GitHub will publish the dashboard after the Pages build finishes. The app remains static and runs entirely in the visitor's browser.
