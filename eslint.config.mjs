import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma 가 만들어 내는 클라이언트 — 우리가 쓰는 코드가 아니라 생성물이다.
    "src/generated/**",
    // 디자인 핸드오프 원본 — 참고 자료이지 이 앱의 소스가 아니다.
    // (React UMD + Babel 환경을 전제로 쓰인 코드라 이 프로젝트 규칙으로 검사할 수 없다)
    "docs/handoff/**",
  ]),
  {
    rules: {
      // 아직 쓰지 않는 인자는 `_` 를 붙여 의도를 드러낸다 —
      // 목 구현이라 안 쓰는 것뿐이고 API 계약에는 남아 있어야 하는 인자들.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
