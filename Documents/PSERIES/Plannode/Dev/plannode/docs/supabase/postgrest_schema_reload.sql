-- 마이그레이션은 했는데 앱에서 "schema cache" / 404 가 날 때만 실행 (SQL Editor → Run)
NOTIFY pgrst, 'reload schema';
