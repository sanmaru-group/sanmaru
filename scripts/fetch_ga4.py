"""GA4のページ別集計を確認する読み取り専用テスト。"""
import os
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest

PROPERTY_ID = os.environ.get("GA4_PROPERTY_ID", "559934517")
PAGES = {
    "/sanmaru/": "グループトップ",
    "/sanmaru/index.html": "グループトップ",
    "/sanmaru/kadogawa.html": "門川",
    "/sanmaru/nobeoka.html": "延岡",
    "/sanmaru/center.html": "センター",
    "/sanmaru/furukawa.html": "古川",
    "/sanmaru/ebisu.html": "恵比須",
}

def main():
    client = BetaAnalyticsDataClient()
    response = client.run_report(RunReportRequest(
        property=f"properties/{PROPERTY_ID}",
        date_ranges=[DateRange(start_date="7daysAgo", end_date="yesterday")],
        dimensions=[Dimension(name="date"), Dimension(name="pagePath")],
        metrics=[Metric(name="screenPageViews"), Metric(name="activeUsers")],
        limit=10000,
    ))
    print("date,store,page_path,views,active_users")
    for row in response.rows:
        day, path = (v.value for v in row.dimension_values)
        if path not in PAGES:
            continue
        views, users = (v.value for v in row.metric_values)
        print(f"{day},{PAGES[path]},{path},{views},{users}")
    print("GA4取得テスト完了（この段階では保存していません）")

if __name__ == "__main__":
    main()
