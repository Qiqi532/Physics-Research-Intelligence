import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 3211;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (url.pathname === "/health") return json(response, 200, { status: "ready" });
  const authorization = request.headers.authorization ?? "";
  if (authorization === "Bearer auth-fail") return json(response, 401, { error: "fixture authentication failure" });
  if (request.method === "GET" && /^\/v1\/models\/[A-Za-z0-9._-]+$/u.test(url.pathname)) {
    return json(response, 200, { id: url.pathname.split("/").at(-1), object: "model" });
  }
  if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
    const body = await readJson(request);
    const system = body?.messages?.find((message: { role?: string }) => message.role === "system")?.content;
    const content = typeof system === "string" && system.includes("Use only these physics tag slugs")
      ? classificationFixture()
      : interpretationFixture();
    return json(response, 200, {
      choices: [{ message: { role: "assistant", content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
    });
  }
  return json(response, 404, { error: "fixture route not found" });
});

server.listen(port, host);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

async function readJson(request: import("node:http").IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: import("node:http").ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function classificationFixture() {
  return {
    tags: [{ slug: "amo-optics", relevance: 0.9, reason: "Synthetic optical fixture.", crossDisciplinary: false }],
    overallRelevance: 0.9,
    reason: "Synthetic connection test classification.",
    crossDisciplinaryTags: [],
  };
}

function interpretationFixture() {
  const reference = { source: "abstract", locator: "abstract", quote: "fictional tabletop measurement" };
  const claim = { text: "这是项目内置合成摘要的连接测试结果。", evidenceLevel: "direct", evidenceReferences: [reference] };
  return {
    basis: "abstract_only",
    sourceDisclosure: "基于摘要解读",
    overviewZh: claim,
    researchQuestion: { ...claim, evidenceLevel: "inferred" },
    innovations: [{ ...claim, evidenceLevel: "inferred" }],
    methodsAndEvidence: [claim],
    limitations: [{ ...claim, evidenceLevel: "uncertain" }],
    readingAdvice: ["这只是连接测试，不代表真实论文结论。"],
  };
}
