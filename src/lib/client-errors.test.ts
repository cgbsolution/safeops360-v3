// npm run test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { errorText, messageFromBody } from "./client-errors";

test("FastAPI detail strings reach the user (the old j.error read showed nothing)", () => {
  assert.equal(errorText({ detail: "Training is required before go-live" }), "Training is required before go-live");
  assert.equal(errorText({ error: "Backend timed out" }), "Backend timed out");
});

test("422 arrays name the field", () => {
  assert.equal(
    messageFromBody({ detail: [{ loc: ["body", "reviewers"], msg: "field required" }] }),
    "reviewers: field required"
  );
});

test("object details and fallbacks", () => {
  assert.equal(errorText({ detail: { message: "Not your task" } }), "Not your task");
  assert.equal(errorText({}, "Save failed"), "Save failed");
  assert.equal(errorText(null, "Save failed"), "Save failed");
});
