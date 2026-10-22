"""GA4 additional aggregated reports. Manual run only; non-destructive per-key upsert."""
import argparse
import os
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest
import google.auth
from googleapiclient.discovery import build

PROPERTY_ID = os.environ.get("GA4_PROPERTY_ID", "559934517")
SPREADSHEET_ID = os.environ["SPREADSHEET_ID"]

# Different reporting grains are intentionally stored separately. Do not sum users across groups.
REPORTS = {
    "GA4_Summary": {
        "dims": ["date"],
        "metrics": ["activeUsers", "totalUsers", "sessions", "screenPageViews", "engagedSessions", "userEngagementDuration"],
    },
    "GA4_Traffic": {
        "dims": ["date", "sessionSourceMedium", "sessionDefaultChannelGroup"],
        "metrics": ["sessions", "activeUsers", "engagedSessions"],
    },
    "GA4_Landing": {
        "dims": ["date", "landingPage"],
        "metrics": ["sessions", "activeUsers", "engagedSessions"],
    },
    "GA4_Devices": {
        "dims": ["date", "deviceCategory"],
        "metrics": ["sessions", "activeUsers", "screenPageViews"],
    },
    "GA4_Region": {
        "dims": ["date", "country", "region", "city"],
        "metrics": ["sessions", "activeUsers"],
    },
    "GA4_Events": {
        "dims": ["date", "eventName"],
        "metrics": ["eventCount", "activeUsers"],
    },
}


def read_report(client, cfg):
    dimensions = cfg["dims"]
    metrics = cfg["metrics"]
    rows = []
    offset = 0
    while True:
        response = client.run_report(RunReportRequest(
            property=f"properties/{PROPERTY_ID}",
            date_ranges=[DateRange(start_date="7daysAgo", end_date="yesterday")],
            dimensions=[Dimension(name=x) for x in dimensions],
            metrics=[Metric(name=x) for x in metrics],
            limit=10000, offset=offset,
        ))
        batch = [[x.value for x in r.dimension_values] +
                 [x.value for x in r.metric_values] for r in response.rows]
        rows.extend(batch)
        offset += len(batch)
        if not batch or offset >= response.row_count:
            break
    return rows


def quote_tab(name):
    return "'" + name.replace("'", "''") + "'"


def upsert(sheets, tab, header, rows, key_columns):
    metadata = sheets.spreadsheets().get(
        spreadsheetId=SPREADSHEET_ID,
        fields="sheets(properties(title))").execute()
    names = {s["properties"]["title"] for s in metadata.get("sheets", [])}
    if tab not in names:
        sheets.spreadsheets().batchUpdate(spreadsheetId=SPREADSHEET_ID, body={
            "requests": [{"addSheet": {"properties": {"title": tab}}}]
        }).execute()
        old = []
    else:
        old = sheets.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID, range=f"{quote_tab(tab)}!A1:Z"
        ).execute().get("values", [])
    if old and old[0] != header:
        raise ValueError(f"Header mismatch in {tab}; refusing to overwrite: {old[0]}")
    merged = {}
    for row in old[1:]:
        if len(row) == len(header):
            merged[tuple(row[i] for i in key_columns)] = row
    for row in rows:
        merged[tuple(str(row[i]) for i in key_columns)] = row
    final = [header] + [merged[k] for k in sorted(merged)]
    sheets.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID, range=f"{quote_tab(tab)}!A1",
        valueInputOption="RAW", body={"values": final}
    ).execute()
    if len(old) > len(final):
        sheets.spreadsheets().values().clear(
            spreadsheetId=SPREADSHEET_ID,
            range=f"{quote_tab(tab)}!A{len(final)+1}:Z{len(old)}", body={}
        ).execute()
    print(f"SAVED {tab}: {len(rows)} recent rows; {len(final)-1} total rows")


def main(write=False):
    client = BetaAnalyticsDataClient()
    collected = {}
    for tab, cfg in REPORTS.items():
        rows = read_report(client, cfg)
        collected[tab] = rows
        print(f"FETCHED {tab}: {len(rows)} rows; columns={cfg['dims'] + cfg['metrics']}")
        for row in rows[:3]:
            print("  sample:", row)
    if not write:
        print("DRY RUN: no data written; pass --write to update additional tabs")
        return
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/spreadsheets"])
    sheets = build("sheets", "v4", credentials=credentials, cache_discovery=False)
    for tab, cfg in REPORTS.items():
        header = cfg["dims"] + cfg["metrics"]
        upsert(sheets, tab, header, collected[tab], list(range(len(cfg["dims"]))))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    main(parser.parse_args().write)
