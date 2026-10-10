/**
 * 리서치 → 드라이브 저장 하네스 진입점.
 *
 * 나머지 하네스와 같은 심기·같은 문을 쓰되, **저장소만 가짜로 바꾼다.** 이 검사는 저장소에
 * 실제로 올라간 *바이트*를 읽어 봐야 해서(`drive.integration` 은 개발 버킷에 올리고 지운다)
 * 로컬에서 뜬 작은 HTTP 서버를 `SUPABASE_URL` 로 가리키게 한다. 앱의 저장소 어댑터는 그대로
 * 돌고, 요청이 닿는 곳만 이 프로세스 안이다 — 그래서 **어떤 환경 변수가 들어 있든 원격에는
 * 닿지 않는다.**
 *
 * 순서가 전부다: 환경 변수를 정한 **다음에** 앱 모듈을 불러온다(`await import`).
 */
import "../load-env.mjs";

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { installRequestContext, session } from "./request-context.mjs";
import { assertLocalOnly } from "./safety.mjs";

// DB 만 본다 — 저장소는 아래에서 가짜로 갈아 끼운다.
assertLocalOnly();

/** 저장소에 올라간 객체. 키는 `버킷/경로`. */
const objects = new Map<string, { body: Buffer; contentType: string }>();

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", async () => {
    try {
      const match = /^\/storage\/v1\/object\/(?:authenticated\/)?(.+?)(?:\?.*)?$/.exec(req.url ?? "");
      if (!match) {
        res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ message: "not found" }));
        return;
      }
      const key = decodeURIComponent(match[1]);

      if (req.method === "GET") {
        const found = objects.get(key);
        if (!found) {
          res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ message: "not found" }));
          return;
        }
        res.writeHead(200, { "content-type": found.contentType }).end(found.body);
        return;
      }

      // 올리기 — supabase-js 는 Blob 이면 multipart 로, Buffer 면 그대로 보낸다.
      const raw = Buffer.concat(chunks);
      const type = String(req.headers["content-type"] ?? "");
      let body = raw;
      let contentType = type;
      if (type.startsWith("multipart/form-data")) {
        const form = await new Response(raw, { headers: { "content-type": type } }).formData();
        const file = [...form.values()].find((v): v is File => typeof v !== "string");
        if (file) {
          body = Buffer.from(await file.arrayBuffer());
          contentType = file.type;
        }
      }
      objects.set(key, { body, contentType });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ Key: key, Id: key }));
    } catch (cause) {
      res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ message: String(cause) }));
    }
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

// 어떤 값이 들어 있었든 덮어쓴다 — 이 프로세스는 로컬 서버하고만 이야기한다.
process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
process.env.SUPABASE_SECRET_KEY = "drive-save-harness";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.SUBMISSIONS_BUCKET = "drive-save-harness";

installRequestContext();

const { run } = await import("./drive-save.integration.mjs");

const okAll = await run({ session, objects });
server.close();
process.exit(okAll ? 0 : 1);
