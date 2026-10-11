# 리서치 PDF 글꼴

`research-pdf.ts` 가 AI 리서처 결과를 PDF 로 만들 때 **PDF 안에 서브셋으로 넣는** 한글 글꼴입니다.

| | |
|---|---|
| 파일 | `NotoSansKR-Regular-ko.ttf` (5.3MB, TrueType 윤곽) |
| 원본 | Google Fonts 저장소 `ofl/notosanskr/NotoSansKR[wght].ttf` (가변 글꼴, 10.4MB) |
| 라이선스 | SIL Open Font License 1.1 — 같은 폴더의 `OFL.txt`. 재배포·수정·내장 가능, 글꼴 단독 판매 불가 |
| SHA-256 | `c026d7339be62eaa42d200928a4a76cf74006cd6580ca6f3247105b2b2a925dc` |

## 왜 이 글꼴인가

- **한글 11,172자 전부 + 한자 + ㈜·℃ 같은 기호**가 있습니다(한자는 이 글꼴이 가진 범위만 — 없는 글자는 PDF 에서 `?` 로 남습니다). 나눔고딕(OFL, 2MB)은
  한자와 `㈜` 가 없어 한자 섞인 제목이나 `㈜카카오` 같은 회사명이 빈 칸이 됩니다 — 한국어 논문 제목에 흔합니다.
- **TrueType 윤곽(glyf)** 이라 `pdf-lib` 이 TrueType 으로 그대로 내장합니다(실측: 서브셋 23ms).
  CFF 글꼴(Noto Sans CJK OTF, 16MB)은 그 경로와 맞지 않는 것으로 알려져 시도하지 않았습니다.
- 서브셋으로 넣으므로 **PDF 한 개는 약 10~20KB** 입니다. 5.3MB 는 서버 함수에 한 번 실리는 크기입니다.

## 만든 방법

가변 글꼴에서 굵기 400 한 벌을 뽑고, 쓰는 유니코드 범위만 남겼습니다
(`pip install fonttools`).

```bash
fonttools varLib.instancer "NotoSansKR[wght].ttf" wght=400 --update-name-table -o NotoSansKR-400.ttf
pyftsubset NotoSansKR-400.ttf \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2000-206F,U+20A9,U+20AC,U+2100-214F,U+2190-21FF,U+2200-22FF,U+2460-24FF,U+25A0-25FF,U+2600-26FF,U+3000-303F,U+3130-318F,U+3200-33FF,U+4E00-9FFF,U+AC00-D7A3,U+FF00-FFEF" \
  --layout-features='' --no-hinting --desubroutinize --name-IDs='*' \
  --output-file=NotoSansKR-Regular-ko.ttf
```

`--layout-features=''` 로 GSUB/GPOS 를 뺐습니다. 한글은 완성형 음절을 그대로 쓰므로 필요 없고,
글자 폭을 잴 때(`widthOfTextAtSize`) 계산도 가벼워집니다.

원문 라이선스 문구의 Reserved Font Name 은 `Source`(Source Han Sans) 입니다. 이 파일의 이름은
`Noto Sans KR` 이라 그 이름을 쓰지 않습니다.

## 서버 함수에 실리는지

`fs.readFile(path.join(process.cwd(), ...))` 는 Next 의 자동 추적이 믿을 수 없어서(빌드 결과를 보면
글꼴이 `/tools/researcher` 에 안 실렸다) `next.config.ts` 의 `outputFileTracingIncludes` 로 직접 겁니다.
빌드 후 `.next/server/app/(tabs)/tools/researcher/page.js.nft.json` 에 글꼴 이름이 있는지 확인하세요.
