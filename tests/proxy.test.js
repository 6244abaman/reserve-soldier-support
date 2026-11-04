// Tests for the proxy (proxy/server.js). A fake Claude client records what
// would have been sent, so these tests cost nothing and need no API key.
const test = require("node:test");
const assert = require("node:assert");
const { createServer } = require("../proxy/server.js");
const { createRateLimiter } = require("../proxy/limits.js");
const sampleProfile = require("./fixtures/sample-profile.js");

function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => {
      calls.push(params);
      if (reply instanceof Error) throw reply;
      return Object.assign({
        content: [{ type: "text", text: "Here is a short look at your numbers." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 }
      }, reply);
    } } }
  };
}

async function withServer(options, fn) {
  const server = createServer(Object.assign({ today: () => "2026-11-04" }, options));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try { await fn(base); } finally { server.close(); }
}

function post(base, body, headers) {
  return fetch(base + "/api/agent", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, headers),
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function request(over) {
  return Object.assign({
    agent: "diagnostic",
    businessId: "b-1",
    profile: sampleProfile(),
    messages: [{ role: "user", content: "What should I handle first?" }]
  }, over);
}

test("health check answers without needing an API key", async () => {
  await withServer({}, async (base) => {
    const res = await fetch(base + "/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).ok, true);
  });
});

test("a good request reaches Claude with the agent file, sector file, and references", async () => {
  const client = fakeClient();
  await withServer({ client }, async (base) => {
    const res = await post(base, request());
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).reply, "Here is a short look at your numbers.");
  });
  const params = client.calls[0];
  assert.strictEqual(params.model, "claude-opus-5-5");
  assert.deepStrictEqual(params.output_config, { effort: "medium" });
  assert.strictEqual(params.fallbacks, "default");
  const [stable, turn] = params.system;
  assert.match(stable.text, /Business Diagnostic agent/);           // agents/diagnostic.md
  assert.match(stable.text, /Trades and construction/);             // sectors/trades-construction.md
  assert.match(stable.text, /Escalation rules/);                    // reference/escalation-rules.md
  assert.match(stable.text, /Israeli benefits reference/);          // reference/israeli-benefits.md
  assert.deepStrictEqual(stable.cache_control, { type: "ephemeral" });
  assert.match(turn.text, /Reply in Hebrew/);
  assert.match(turn.text, /Today's date: 2026-11-04/);
  assert.match(turn.text, /Noam Carpentry/);
});

test("the phone number and Cover Person contact are never sent to Claude", async () => {
  const client = fakeClient();
  const profile = sampleProfile();
  profile.cover.contact = "052-111 2222";
  await withServer({ client }, async (base) => { await post(base, request({ profile })); });
  const sent = JSON.stringify(client.calls[0]);
  assert.ok(!sent.includes("050-123 4567"));
  assert.ok(!sent.includes("052-111 2222"));
});

test("English profiles get English replies; Cover Person speakers are named as helpers", async () => {
  const client = fakeClient();
  const profile = sampleProfile();
  profile.meta.language = "en";
  await withServer({ client }, async (base) => { await post(base, request({ profile, speaker: "cover" })); });
  assert.match(client.calls[0].system[1].text, /Reply in English/);
  assert.match(client.calls[0].system[1].text, /Cover Person, as a helper/);
});

test("Level 1 and 2 messages never reach Claude; the app gets a handoff", async () => {
  const client = fakeClient();
  await withServer({ client }, async (base) => {
    const one = await (await post(base, request({ messages: [{ role: "user", content: "אני לא רוצה לחיות" }] }))).json();
    assert.strictEqual(one.handoff.level, 1);
    const two = await (await post(base, request({ messages: [{ role: "user", content: "I got a lawyer's letter" }] }))).json();
    assert.strictEqual(two.handoff.level, 2);
  });
  assert.strictEqual(client.calls.length, 0);
});

test("Level 3 continues, with a careful note to the agent and the flag back to the app", async () => {
  const client = fakeClient();
  await withServer({ client }, async (base) => {
    const body = await (await post(base, request({ messages: [{ role: "user", content: "I'm exhausted. What first?" }] }))).json();
    assert.strictEqual(body.escalation.level, 3);
  });
  assert.match(client.calls[0].system[1].text, /Level 3/);
});

test("unknown agents and file-path tricks are refused", async () => {
  await withServer({ client: fakeClient() }, async (base) => {
    for (const agent of ["hacker", "../CLAUDE.md", "agents/router.md", "toString"]) {
      const res = await post(base, request({ agent }));
      assert.strictEqual(res.status, 400, agent);
    }
  });
});

test("profiles that break the schema (like an ID number) are refused", async () => {
  const profile = sampleProfile();
  profile.person.idNumber = "123456789";
  await withServer({ client: fakeClient() }, async (base) => {
    const res = await post(base, request({ profile }));
    assert.strictEqual(res.status, 400);
    assert.match((await res.json()).error, /schema/);
  });
});

test("size limits: too many messages, too long a message, too big a request", async () => {
  await withServer({ client: fakeClient() }, async (base) => {
    const many = Array.from({ length: 41 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "hi" }));
    assert.strictEqual((await post(base, request({ messages: many }))).status, 400);
    assert.strictEqual((await post(base, request({ messages: [{ role: "user", content: "x".repeat(4001) }] }))).status, 400);
    assert.strictEqual((await post(base, "{\"agent\":\"" + "x".repeat(210 * 1024) + "\"}")).status, 413);
    assert.strictEqual((await post(base, "not json")).status, 400);
  });
});

test("the conversation must start and end with the soldier", async () => {
  await withServer({ client: fakeClient() }, async (base) => {
    const res = await post(base, request({ messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }] }));
    assert.strictEqual(res.status, 400);
  });
});

test("rate limit: too many requests from one address get 429", async () => {
  const rateLimiter = createRateLimiter({ limit: 2 });
  await withServer({ client: fakeClient(), rateLimiter }, async (base) => {
    assert.strictEqual((await post(base, request())).status, 200);
    assert.strictEqual((await post(base, request())).status, 200);
    const third = await post(base, request());
    assert.strictEqual(third.status, 429);
    assert.ok(Number(third.headers.get("retry-after")) > 0);
  });
});

test("a refusal returns no reply; Claude being busy returns a friendly 503", async () => {
  await withServer({ client: fakeClient({ stop_reason: "refusal", content: [] }) }, async (base) => {
    assert.deepStrictEqual(await (await post(base, request())).json(), { reply: null, refused: true });
  });
  await withServer({ client: fakeClient(Object.assign(new Error("overloaded"), { status: 529 })) }, async (base) => {
    assert.strictEqual((await post(base, request())).status, 503);
  });
});

test("without an API key the proxy says it is not set up, instead of crashing", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await withServer({}, async (base) => {
      const res = await post(base, request());
      assert.strictEqual(res.status, 503);
      assert.match((await res.json()).error, /not set up/);
    });
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});

test("a bare host name from Render counts as its https address", async () => {
  process.env.ALLOWED_ORIGINS = "momentum-app-x1y2.onrender.com";
  try {
    await withServer({ client: fakeClient() }, async (base) => {
      const ok = await post(base, request(), { Origin: "https://momentum-app-x1y2.onrender.com" });
      assert.strictEqual(ok.headers.get("access-control-allow-origin"), "https://momentum-app-x1y2.onrender.com");
    });
  } finally {
    delete process.env.ALLOWED_ORIGINS;
  }
});

test("only the app's own web address may call the proxy from a browser", async () => {
  process.env.ALLOWED_ORIGINS = "https://momentum-app.onrender.com";
  try {
    await withServer({ client: fakeClient() }, async (base) => {
      const ok = await post(base, request(), { Origin: "https://momentum-app.onrender.com" });
      assert.strictEqual(ok.headers.get("access-control-allow-origin"), "https://momentum-app.onrender.com");
      const other = await post(base, request(), { Origin: "https://evil.example" });
      assert.strictEqual(other.headers.get("access-control-allow-origin"), null);
    });
  } finally {
    delete process.env.ALLOWED_ORIGINS;
  }
});
