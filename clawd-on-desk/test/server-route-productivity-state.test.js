"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");

const {
  CLAWD_SERVER_HEADER,
  CLAWD_SERVER_ID,
} = require("../hooks/server-config");
const {
  sanitizeProductivityState,
  handleProductivityStatePost,
} = require("../src/server-route-productivity-state");

function makeReq(body) {
  const req = new EventEmitter();
  setImmediate(() => {
    if (body != null) req.emit("data", Buffer.from(body));
    req.emit("end");
  });
  return req;
}

function makeRes() {
  return {
    statusCode: null,
    headers: {},
    body: "",
    writeHead(code, headers) {
      this.statusCode = code;
      if (headers) this.headers = headers;
    },
    end(data) {
      if (data) this.body += String(data);
      if (this.resolve) this.resolve(this);
    },
  };
}

function callProductivityPost(body, ctx = {}) {
  return new Promise((resolve) => {
    const res = makeRes();
    const calls = [];
    res.resolve = (finalRes) => resolve({ res: finalRes, calls });
    handleProductivityStatePost(makeReq(body), res, {
      ctx: {
        updateProductivityState: (snapshot) => calls.push(snapshot),
        ...ctx,
      },
    });
  });
}

describe("sanitizeProductivityState", () => {
  it("keeps the phase 1 fields and trims unsafe text", () => {
    const state = sanitizeProductivityState({
      mode: "working",
      currentTask: {
        id: " task-1 ",
        title: " Demo\u0000 task ",
        tagIds: [" a ", "", "b"],
      },
      timer: {
        isRunning: true,
        elapsedToday: 120000,
      },
      day: {
        plannedTaskCount: 3,
        completedTaskCount: 2,
        totalTrackedMs: 240000,
      },
      ignored: "field",
    });

    assert.deepStrictEqual(state, {
      mode: "working",
      currentTask: {
        id: "task-1",
        title: "Demo  task",
        tagIds: ["a", "b"],
      },
      timer: {
        isRunning: true,
        elapsedToday: 120000,
      },
      day: {
        plannedTaskCount: 3,
        completedTaskCount: 2,
        totalTrackedMs: 240000,
      },
    });
  });

  it("rejects unknown modes", () => {
    assert.strictEqual(sanitizeProductivityState({ mode: "agent-working" }), null);
  });
});

describe("handleProductivityStatePost", () => {
  it("accepts a valid Super Productivity snapshot", async () => {
    const { res, calls } = await callProductivityPost(JSON.stringify({
      source: "super-productivity",
      schemaVersion: 1,
      sentAt: 1781000000000,
      state: {
        mode: "working",
        currentTask: { id: "task-1", title: "Demo task" },
        timer: { isRunning: true },
      },
    }));

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers[CLAWD_SERVER_HEADER], CLAWD_SERVER_ID);
    assert.deepStrictEqual(JSON.parse(res.body), {
      ok: true,
      acceptedSchemaVersion: 1,
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].source, "super-productivity");
    assert.strictEqual(calls[0].schemaVersion, 1);
    assert.strictEqual(calls[0].state.mode, "working");
  });

  it("rejects unsupported schema versions without updating state", async () => {
    const { res, calls } = await callProductivityPost(JSON.stringify({
      source: "super-productivity",
      schemaVersion: 99,
      sentAt: 1781000000000,
      state: { mode: "working" },
    }));

    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(JSON.parse(res.body), {
      ok: false,
      error: "unsupported_schema_version",
      acceptedSchemaVersion: 1,
    });
  });

  it("rejects malformed state without updating state", async () => {
    const { res, calls } = await callProductivityPost(JSON.stringify({
      source: "super-productivity",
      schemaVersion: 1,
      sentAt: 1781000000000,
      state: { mode: "not-real" },
    }));

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(calls.length, 0);
    assert.deepStrictEqual(JSON.parse(res.body), {
      ok: false,
      error: "invalid_state",
    });
  });
});
