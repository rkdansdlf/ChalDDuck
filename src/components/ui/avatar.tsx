import Image from "next/image";
import type { MbtiType } from "@/lib/mbti";
import { characterImage } from "@/lib/mbti";

/**
 * 팀원 자리.
 *
 * MBTI 가 있으면 16종 캐릭터 이미지를, 없으면 이름 첫 글자 모노그램(점선 원)을 쓴다.
 * 캐릭터 고유 이름은 기획안에 없어 MBTI 유형명을 그대로 표시한다.
 */
export function Avatar({
  name,
  mbti,
  size = 36,
}: {
  name?: string;
  mbti?: MbtiType | null;
  size?: number;
}) {
  if (mbti) {
    return (
      <span
        className="block flex-none overflow-hidden rounded-full border border-line bg-yellow-100"
        style={{ width: size, height: size }}
      >
        <Image
          src={characterImage(mbti)}
          alt={`${mbti} 캐릭터`}
          width={size}
          height={size}
          className="size-full object-cover"
        />
      </span>
    );
  }

  const initial = (name ?? "?").trim().charAt(0) || "?";
  return (
    <span
      title="MBTI 미입력 — 캐릭터 미배정, 이름 모노그램으로 대신 표시"
      className="grid flex-none place-items-center rounded-full border border-dashed border-line-strong bg-fill font-bold leading-none text-txt-muted"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initial}
    </span>
  );
}
