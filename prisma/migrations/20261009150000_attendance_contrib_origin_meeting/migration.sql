-- 회의 참석 기여 기록의 원천을 "출석 행" 에서 "회의" 로 옮긴다.
--
-- 왜: 출석 행은 체크를 풀면 지워지고 다시 체크하면 새 아이디로 만들어진다. 기록이 출석 아이디에
-- 묶여 있으면, 팀원 확인이나 이견이 붙어 회수되지 않고 남은 기록을 다시 체크할 때 알아보지 못해
-- 같은 참석이 두 건의 기여로 세어졌다. (회의, 사람) 쌍은 MeetingAttendance 의 유일 키와 같다.
--
-- 아직 출석 행이 남아 있는 기록만 옮긴다. 출석 행이 이미 지워진 기록은 어느 회의인지 알 수
-- 없어 그대로 둔다 — 지우지 않는다(팀원 확인이나 이견이 붙은 기록일 수 있다).
UPDATE "ContribRecord" AS r
SET "originId" = a."meetingId"
FROM "MeetingAttendance" AS a
WHERE r."originType" = 'meeting_attendance'
  AND r."originId" = a."id"
  AND r."memberId" = a."memberId";
