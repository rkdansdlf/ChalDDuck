"use client";

import { useSyncExternalStore } from "react";
import type { FileVersion } from "@/lib/types";

/**
 * 파일 버전 상태.
 *
 * 핵심 규칙: **복원은 덮어쓰기가 아니라 새 버전 추가다.** 옛 버전으로 되돌려도
 * 그 사이의 작업이 사라지지 않아야 하고, 되돌린 것 자체도 기록에 남아야 한다.
 *
 * 22(열람·복원)에서 복원하고 13(버전 기록)으로 돌아가면 새 버전이 보여야 하므로
 * 화면 지역 상태로 둘 수 없다.
 *
 * TODO(서버): 복원은 원래 팀원 모두가 같은 결과를 보는 서버 작업이다.
 * 지금은 내 브라우저 안에서만 유지된다.
 */

/** 제출함별로 "복원 이후의 목록". 손대지 않은 제출함은 여기에 없고 서버 목록을 그대로 쓴다. */
type State = Record<string, FileVersion[]>;

const EMPTY: State = {};

let state: State = EMPTY;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * 다음 버전 이름을 고른다.
 *
 * 이미 있는 `v<숫자>` 중 가장 큰 수 + 1. 목록 길이로 세면 `img1` 처럼 번호가 아닌
 * 항목 때문에 이미 있는 이름과 부딪힌다.
 */
export function nextVersionLabel(versions: FileVersion[]): string {
  const highest = versions.reduce((max, v) => {
    const matched = /^v(\d+)$/.exec(v.label);
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0);
  return `v${highest + 1}`;
}

/**
 * `source` 의 내용을 새 버전으로 맨 위에 추가한다. 기존 버전은 하나도 지우지 않는다.
 *
 * @returns 새로 만들어진 버전.
 */
export function restoreVersion(
  boxId: string,
  versions: FileVersion[],
  source: FileVersion,
  by: string,
): FileVersion {
  const label = nextVersionLabel(versions);
  const restored: FileVersion = {
    ...source,
    id: `${boxId}-${label}`,
    label,
    author: by,
    when: "방금",
    note: `${source.label} 복원`,
  };

  state = { ...state, [boxId]: [restored, ...versions] };
  for (const listener of listeners) listener();
  return restored;
}

/** 서버 목록 위에 이 세션에서 복원한 내용을 덮어 읽는다. */
export function useVersions(boxId: string, fromServer: FileVersion[]): FileVersion[] {
  const overrides = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
  return overrides[boxId] ?? fromServer;
}
