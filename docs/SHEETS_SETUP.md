
# Google Sheets Backend Setup

Nexus OS supports using Google Sheets as a database via a Google Apps Script proxy.

## 1. Create the Sheet
1. Create a new Google Sheet.
2. Create three tabs: `users`, `contacts`, `branding`.
3. Columns for `users`: `id`, `email`, `name`, `role`.
4. Columns for `contacts`: `id`, `company`, `name`, `email`, `status`, `value`, `notes`.
5. Columns for `branding`: `name`, `primaryColor`, `heroHeadline`, `heroSubheadline`.

## 2. Deploy Apps Script
1. In Google Sheets, go to **Extensions > Apps Script**.
2. Paste the following proxy code:

```javascript
const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function doGet(e) {
  const table = e.parameter.table;
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(table);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const json = data.map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return ContentService.createTextOutput(JSON.stringify(json)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  // Implement row upsert logic here...
}
```

3. Click **Deploy > New Deployment**.
4. Select **Web App**. Set access to **"Anyone"**.
5. Copy the **Web App URL**.

## 3. Configure Nexus
1. Add to your `.env` or Netlify variables:
   - `VITE_BACKEND_MODE=sheets`
   - `VITE_SHEETS_API_BASE_URL=PASTE_YOUR_APPS_SCRIPT_URL_HERE`
