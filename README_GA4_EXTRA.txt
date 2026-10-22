GA4追加レポート（手動実行）

このZIP内の scripts と .github フォルダを sanmaru のルートにコピーしてください。
既存 fetch_ga4.py / fetch_analytics.yml / GA4_Daily は変更しません。
GitHub Actions > GA4 additional reports (manual) > Run workflow。
最初は save_to_sheets=false で取得ログを確認。
成功したら true で再実行して6つのタブを作成します。
自動実行は今回まだ設定しません。

重要：GA4のセッション別・ページ別・ユーザー別数値は単純合計しないこと。
GA4 Events はすでに記録されているイベントだけ取得します。
