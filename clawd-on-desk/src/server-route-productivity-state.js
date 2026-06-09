"use strict";

const {
  CLAWD_SERVER_HEADER,
  CLAWD_SERVER_ID,
} = require("../hooks/server-config");

const MAX_PRODUCTIVITY_STATE_BODY_BYTES = 8192;
const VALID_MODES = new Set([
  "idle",
  "working",
  "paused",
  "break",
  "planning",
  "overdue",
  "attention",
  "finishedDay",
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeString(value, maxLength) {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : undefined;
}

function sanitizeStringArray(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return undefined;
  const out = [];
  for (const item of value) {
    const text = sanitizeString(item, maxLength);
    if (text) out.push(text);
    if (out.length >= maxItems) break;
  }
  return out.length ? out : undefined;
}

function sanitizeCurrentTask(value) {
  if (!isPlainObject(value)) return undefined;
  const id = sanitizeString(value.id, 160);
  if (!id) return undefined;
  const out = { id };
  const title = sanitizeString(value.title, 240);
  if (title) out.title = title;
  const projectId = sanitizeString(value.projectId, 160);
  if (projectId) out.projectId = projectId;
  const tagIds = sanitizeStringArray(value.tagIds, 50, 160);
  if (tagIds) out.tagIds = tagIds;
  const timeSpentToday = sanitizeNumber(value.timeSpentToday);
  if (timeSpentToday !== undefined && timeSpentToday >= 0) out.timeSpentToday = timeSpentToday;
  const estimate = sanitizeNumber(value.estimate);
  if (estimate !== undefined && estimate >= 0) out.estimate = estimate;
  return out;
}

function sanitizeTimer(value) {
  if (!isPlainObject(value)) return undefined;
  const out = { isRunning: value.isRunning === true };
  const startedAt = sanitizeNumber(value.startedAt);
  if (startedAt !== undefined && startedAt >= 0) out.startedAt = startedAt;
  const elapsedToday = sanitizeNumber(value.elapsedToday);
  if (elapsedToday !== undefined && elapsedToday >= 0) out.elapsedToday = elapsedToday;
  return out;
}

function sanitizeProductivityState(value) {
  if (!isPlainObject(value)) return null;
  const mode = sanitizeString(value.mode, 40);
  if (!mode || !VALID_MODES.has(mode)) return null;
  const out = { mode };
  const currentTask = sanitizeCurrentTask(value.currentTask);
  if (currentTask) out.currentTask = currentTask;
  const timer = sanitizeTimer(value.timer);
  if (timer) out.timer = timer;
  return out;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    [CLAWD_SERVER_HEADER]: CLAWD_SERVER_ID,
  });
  res.end(JSON.stringify(body));
}

function handleProductivityStatePost(req, res, options) {
  const { ctx } = options;
  let body = "";
  let bodySize = 0;
  let tooLarge = false;

  req.on("data", (chunk) => {
    if (tooLarge) return;
    bodySize += chunk.length;
    if (bodySize > MAX_PRODUCTIVITY_STATE_BODY_BYTES) {
      tooLarge = true;
      return;
    }
    body += chunk;
  });

  req.on("end", () => {
    if (tooLarge) {
      sendJson(res, 413, { ok: false, error: "payload_too_large" });
      return;
    }

    let data;
    try {
      data = JSON.parse(body);
    } catch {
      sendJson(res, 400, { ok: false, error: "bad_json" });
      return;
    }

    if (!isPlainObject(data)) {
      sendJson(res, 400, { ok: false, error: "invalid_payload" });
      return;
    }
    if (data.source !== "super-productivity") {
      sendJson(res, 400, { ok: false, error: "invalid_source" });
      return;
    }
    if (data.schemaVersion !== 1) {
      sendJson(res, 409, {
        ok: false,
        error: "unsupported_schema_version",
        acceptedSchemaVersion: 1,
      });
      return;
    }
    if (!Number.isFinite(data.sentAt) || data.sentAt <= 0) {
      sendJson(res, 400, { ok: false, error: "invalid_sent_at" });
      return;
    }

    const state = sanitizeProductivityState(data.state);
    if (!state) {
      sendJson(res, 400, { ok: false, error: "invalid_state" });
      return;
    }

    if (typeof ctx.updateProductivityState !== "function") {
      sendJson(res, 503, { ok: false, error: "productivity_state_unavailable" });
      return;
    }

    ctx.updateProductivityState({
      source: "super-productivity",
      schemaVersion: 1,
      sentAt: data.sentAt,
      receivedAt: Date.now(),
      state,
    });
    sendJson(res, 200, { ok: true, acceptedSchemaVersion: 1 });
  });
}

module.exports = {
  MAX_PRODUCTIVITY_STATE_BODY_BYTES,
  sanitizeProductivityState,
  handleProductivityStatePost,
};
