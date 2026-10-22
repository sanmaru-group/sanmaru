"""GA4 daily per-page metrics to Google Sheets. OIDC/ADC; no JSON key."""
import argparse
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import google.auth
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest
from googleapiclient.discovery import build

PROPERTY_ID = os.getenv('GA4_PROPERTY_ID', '559934517')
SPREADSHEET_ID = os.environ['SPREADSHEET_ID']
SHEET_NAME = 'GA4_Daily'
HEADER = ['date', 'store', 'page_path', 'views', 'active_users']
PAGES = {
    '/sanmaru/': 'グループトップ',
    '/sanmaru/index.html': 'グループトップ',
    '/sanmaru/kadogawa.html': '門川',
    '/sanmaru/nobeoka.html': '延岡',
    '/sanmaru/center.html': 'センター',
    '/sanmaru/furukawa.html': '古川',
    '/sanmaru/ebisu.html': '恵比須',
}


def obtain_ga4():
    client = BetaAnalyticsDataClient()
    result = client.run_report(RunReportRequest(
        property=f'properties/{PROPERTY_ID}',
        date_ranges=[DateRange(start_date='7daysAgo', end_date='yesterday')],
        dimensions=[Dimension(name='date'), Dimension(name='pagePath')],
        metrics=[Metric(name='screenPageViews'), Metric(name='activeUsers')],
        limit=10000,
    ))
    rows = []
    for item in result.rows:
        day, path = [v.value for v in item.dimension_values]
        if path not in PAGES:
            continue
        views, users = [int(v.value) for v in item.metric_values]
        rows.append([day, PAGES[path], path, views, users])
    return rows


def main(write):
    rows = obtain_ga4()
    print(f'GA4 fetched {len(rows)} page/day rows for last 7 days')
    for row in rows[:40]:
        print(','.join(map(str, row)))
    if not write:
        print('DRY RUN: No sheet updated. Re-run with --write to save.')
        return

    scopes = ['https://www.googleapis.com/auth/spreadsheets']
    creds, _ = google.auth.default(scopes=scopes)
    sheets = build('sheets', 'v4', credentials=creds, cache_discovery=False)
    metadata = sheets.spreadsheets().get(spreadsheetId=SPREADSHEET_ID, fields='sheets(properties(sheetId,title))').execute()
    tabs = {s['properties']['title'] for s in metadata.get('sheets', [])}
    if SHEET_NAME not in tabs:
        sheets.spreadsheets().batchUpdate(spreadsheetId=SPREADSHEET_ID, body={
            'requests': [{'addSheet': {'properties': {'title': SHEET_NAME}}}]
        }).execute()
        existing = []
    else:
        existing = sheets.spreadsheets().values().get(
            spreadsheetId=SPREADSHEET_ID, range=f"'{SHEET_NAME}'!A1:E"
        ).execute().get('values', [])

    if existing and existing[0] != HEADER:
        raise ValueError(f'{SHEET_NAME} header mismatch; not overwriting other data: {existing[0]}')

    # Date + URL is the unique record key. Preserve older dates, refresh the latest 7 days.
    keyed = {}
    for r in existing[1:]:
        if len(r) >= 5:
            keyed[(r[0], r[2])] = r[:5]
    for r in rows:
        keyed[(r[0], r[2])] = r
    merged = [HEADER] + [keyed[k] for k in sorted(keyed)]
    sheets.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{SHEET_NAME}'!A1",
        valueInputOption='RAW',
        body={'values': merged},
    ).execute()
    if existing and len(existing) > len(merged):
        sheets.spreadsheets().values().clear(
            spreadsheetId=SPREADSHEET_ID,
            range=f"'{SHEET_NAME}'!A{len(merged)+1}:E{len(existing)}",
            body={},
        ).execute()
    print(f'SAVED {len(rows)} fetched rows, {len(merged)-1} historical rows retained')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true', help='Write results into Google Sheets')
    args = parser.parse_args()
    main(args.write)
