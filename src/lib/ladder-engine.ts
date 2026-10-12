/**
 * 사다리타기(Ladder Game) 엔진.
 *
 * 사다리는 기둥(Column)들과 가로 발판(Rung)들로 이루어진 1:1 전단사(Bijection) 그래프다.
 * 어떤 도착점도 위로 역추적하면 고유한 출발점에 도달한다.
 *
 * 서버가 이미 당첨 결과(`winnerIndex`)를 확정하고 있으므로,
 * 자연스러운 가로 발판들을 무작위 생성한 뒤 역추적을 통해
 * 해당 당첨 결과로 이어지는 시작점(출발 라인)과 꺾은선 경로(Waypoints)를 산출한다.
 */

export type LadderRung = {
  id: string;
  /** 가로줄이 위치하는 행(0 ~ levelCount - 1) */
  level: number;
  /** col 과 col + 1 사이를 연결 */
  col: number;
};

export type Point = {
  x: number;
  y: number;
};

export type LadderConfig = {
  columnCount: number;
  levelCount?: number;
};

export type LadderGeometry = {
  width: number;
  height: number;
  top: number;
  bottom: number;
  colX: (col: number) => number;
  levelY: (level: number) => number;
};

/**
 * 인접 가로줄이 겹치지 않고, 기둥마다 적절히 꺾이도록 발판을 무작위 생성한다.
 */
export function generateLadderRungs(columnCount: number, levelCount = 7): LadderRung[] {
  if (columnCount < 2) return [];

  const rungs: LadderRung[] = [];
  // 각 기둥이 최소 한 번 이상 가로줄을 갖도록 확인하기 위한 카운터
  const colConnections = new Array(columnCount).fill(0);

  // 1단계: 각 레벨마다 확률적으로 가로줄 생성 (인접 방지)
  for (let level = 0; level < levelCount; level++) {
    for (let col = 0; col < columnCount - 1; col++) {
      // 같은 레벨에서 바로 이전 열에 가로줄이 있으면 이번 열은 건너뛴다
      const prevInSameLevel = rungs.some((r) => r.level === level && r.col === col - 1);
      if (prevInSameLevel) continue;

      // 55% 확률로 가로줄 생성
      if (Math.random() < 0.55) {
        rungs.push({
          id: `rung-${level}-${col}`,
          level,
          col,
        });
        colConnections[col]++;
        colConnections[col + 1]++;
      }
    }
  }

  // 2단계: 가로줄이 하나도 없는 기둥이 있다면 보강 (직선 단조로움 방지)
  for (let col = 0; col < columnCount - 1; col++) {
    if (colConnections[col] === 0 || colConnections[col + 1] === 0) {
      // 비어 있는 적절한 레벨 탐색
      const availableLevel = Array.from({ length: levelCount }, (_, i) => i).find(
        (lvl) =>
          !rungs.some(
            (r) => r.level === lvl && (r.col === col - 1 || r.col === col || r.col === col + 1),
          ),
      );
      if (availableLevel !== undefined) {
        rungs.push({
          id: `rung-fix-${availableLevel}-${col}`,
          level: availableLevel,
          col,
        });
        colConnections[col]++;
        colConnections[col + 1]++;
      }
    }
  }

  return rungs;
}

/**
 * 하단 도착점(endCol)에서 위로 역추적하여 시작점(startCol)을 찾는다.
 */
export function findStartColumnForWinner(
  rungs: LadderRung[],
  endCol: number,
  levelCount = 7,
): number {
  let currCol = endCol;
  // 바닥에서부터 위로 올라가며 가로줄을 만나면 반대편으로 이동
  for (let level = levelCount - 1; level >= 0; level--) {
    const leftRung = rungs.find((r) => r.level === level && r.col === currCol - 1);
    if (leftRung) {
      currCol -= 1;
      continue;
    }
    const rightRung = rungs.find((r) => r.level === level && r.col === currCol);
    if (rightRung) {
      currCol += 1;
      continue;
    }
  }
  return currCol;
}

/**
 * 출발점(startCol)에서 아래로 내려가며 모든 꺾은선 좌표(Waypoints)를 생성한다.
 */
export function tracePathWaypoints(
  rungs: LadderRung[],
  startCol: number,
  levelCount: number,
  geo: LadderGeometry,
): Point[] {
  const points: Point[] = [];
  let currCol = startCol;

  // 시작점
  points.push({ x: geo.colX(currCol), y: geo.top });

  // 각 레벨을 지나면서 가로줄을 만나면 수평 이동
  for (let level = 0; level < levelCount; level++) {
    const y = geo.levelY(level);

    const leftRung = rungs.find((r) => r.level === level && r.col === currCol - 1);
    const rightRung = rungs.find((r) => r.level === level && r.col === currCol);

    if (leftRung) {
      // 꺾임 지점 도달 후 왼쪽으로 이동
      points.push({ x: geo.colX(currCol), y });
      currCol -= 1;
      points.push({ x: geo.colX(currCol), y });
    } else if (rightRung) {
      // 꺾임 지점 도달 후 오른쪽으로 이동
      points.push({ x: geo.colX(currCol), y });
      currCol += 1;
      points.push({ x: geo.colX(currCol), y });
    }
  }

  // 최종 도착점 바닥
  points.push({ x: geo.colX(currCol), y: geo.bottom });

  return points;
}

/**
 * Waypoints 포인트들을 SVG path 문자열("M x y L x y ...")로 변환한다.
 */
export function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, idx) => (idx === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`))
    .join(" ");
}

/**
 * 웨이포인트 경로의 총 거리와 각 구간 길이를 산출한다.
 */
export function getPathSegments(points: Point[]): {
  totalLength: number;
  segments: { from: Point; to: Point; length: number; cumulative: number }[];
} {
  const segments: { from: Point; to: Point; length: number; cumulative: number }[] = [];
  let totalLength = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    totalLength += length;
    segments.push({
      from,
      to,
      length,
      cumulative: totalLength,
    });
  }

  return { totalLength, segments };
}

/**
 * 진행률 progress(0 ~ 1)에 해당하는 경로 상의 (x, y) 좌표를 보간 계산한다.
 */
export function getInterpolatedPoint(
  points: Point[],
  progress: number,
  segmentsMeta: ReturnType<typeof getPathSegments>,
): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (progress <= 0) return points[0];
  if (progress >= 1) return points[points.length - 1];

  const targetDist = progress * segmentsMeta.totalLength;
  const seg = segmentsMeta.segments.find((s) => s.cumulative >= targetDist) ?? segmentsMeta.segments[segmentsMeta.segments.length - 1];

  if (!seg || seg.length === 0) return points[points.length - 1];

  const segStartDist = seg.cumulative - seg.length;
  const segProgress = Math.max(0, Math.min(1, (targetDist - segStartDist) / seg.length));

  return {
    x: seg.from.x + (seg.to.x - seg.from.x) * segProgress,
    y: seg.from.y + (seg.to.y - seg.from.y) * segProgress,
  };
}
