-- 예전 제출함의 "9/15" 같은 마감 문자열을 마감 시각(그날 23:59, 한국 시간)으로 옮긴다.
-- 이게 없으면 기존 팀의 "마감 후 제출" 라벨이 사라진다(라벨은 이제 dueAt 으로 계산한다).
--
-- 연도는 문자열에 없어 2026 으로 둔다 — 이 앱의 팀은 모두 2026년 학기에 만들어졌다.
-- 날짜는 1월 1일에 달·일을 더해 만든다. make_timestamp 는 "2/30" 같은 값에서 오류를 내
-- 배포 마이그레이션 전체를 멈추게 하는데, 더하기는 넘치면 다음 달로 넘어갈 뿐이다.
-- dueAt 은 시간대 없는 UTC 로 저장되므로 한국 시간 → UTC 로 바꿔 넣는다.
UPDATE "SubmissionBox"
SET "dueAt" = (
  (DATE '2026-01-01'
    + (split_part("due", '/', 1)::int - 1) * INTERVAL '1 month'
    + (split_part("due", '/', 2)::int - 1) * INTERVAL '1 day'
    + TIME '23:59') AT TIME ZONE 'Asia/Seoul'
) AT TIME ZONE 'UTC'
WHERE "dueAt" IS NULL
  AND "due" ~ '^[0-9]{1,2}/[0-9]{1,2}$'
  AND split_part("due", '/', 1)::int BETWEEN 1 AND 12
  AND split_part("due", '/', 2)::int BETWEEN 1 AND 31;
