import { test } from "node:test";
import assert from "node:assert/strict";

import { formatAnswers } from "../src/format.js";

test("formatAnswers renders one line per question plus raw JSON", () => {
  const answers = {
    workflow: {
      type: "choice",
      choice: "bugfix",
      probabilities: { bugfix: 0.9781, build: 0.0219 },
      confidence: 0.89,
    },
    needs_clarification: { type: "noul", noul: 0.03 },
    urgency: { type: "score", score: 1.2, confidence: 0.64 },
  };
  const out = formatAnswers(answers);
  const lines = out.split("\n");
  assert.ok(lines.includes("workflow: bugfix (P=0.978, confidence=0.89)"));
  assert.ok(lines.includes("needs_clarification: no (P(true)=0.03)"));
  assert.ok(lines.includes("urgency: 1.2 (score)"));
  assert.ok(out.includes("```json"));
  assert.ok(out.includes(JSON.stringify(answers, null, 2)));
});

test("formatAnswers renders yes when noul >= 0.5", () => {
  const out = formatAnswers({ is_broken: { type: "noul", noul: 0.959 } });
  assert.ok(out.split("\n").includes("is_broken: yes (P(true)=0.959)"));
});

test("formatAnswers tolerates answers missing optional fields", () => {
  const out = formatAnswers({ x: { type: "noul", noul: 0.9 } });
  assert.ok(out.split("\n").includes("x: yes (P(true)=0.9)"));
  const outChoice = formatAnswers({
    y: { type: "choice", choice: "other", probabilities: { other: 0.6 } },
  });
  assert.ok(outChoice.split("\n").includes("y: other (P=0.6)"));
});

test("formatAnswers renders a choice without probabilities when absent", () => {
  const out = formatAnswers({ z: { type: "choice", choice: "approve" } });
  assert.ok(out.split("\n").includes("z: approve"));
});

function jsonBlock(out) {
  const match = out.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, "expected a json block");
  return JSON.parse(match[1]);
}

test("computed lines come first", () => {
  const answers = { risk: { type: "choice", choice: "safe" } };
  const touched = formatAnswers(answers, { computed: { touches_invariants: { p: 0.7, flagged: ["b", "c"] } } });
  assert.equal(touched.split("\n")[0], "touches_invariants: yes (P=0.7; flagged: b, c)");
  const untouched = formatAnswers(answers, { computed: { touches_invariants: { p: 0.2, flagged: [] } } });
  assert.equal(untouched.split("\n")[0], "touches_invariants: no (P=0.2)");
  const raised = formatAnswers(answers, { computed: { final_risk: { level: "needs_confirm", raisedBy: ["x"] } } });
  assert.equal(raised.split("\n")[0], "final_risk: needs_confirm (raised by: x)");
  const plain = formatAnswers(answers, { computed: { final_risk: { level: "safe", raisedBy: [] } } });
  assert.deepEqual(plain.split("\n").slice(0, 2), ["final_risk: safe", "risk: safe"]);
});

test("raw JSON includes computed only when present", () => {
  const answers = { x: { type: "noul", noul: 0.9 } };
  assert.equal(jsonBlock(formatAnswers(answers)).computed, undefined);
  assert.equal(jsonBlock(formatAnswers(answers, { computed: {} })).computed, undefined);
  const computed = { final_risk: { level: "safe", raisedBy: [] } };
  const parsed = jsonBlock(formatAnswers(answers, { computed }));
  assert.deepEqual(parsed.computed, computed);
  assert.deepEqual(parsed.x, answers.x);
});

test("config footer is the last line", () => {
  const answers = { x: { type: "noul", noul: 0.9 } };
  assert.ok(formatAnswers(answers, { configPath: "/r/.systemone.json" }).endsWith("\nconfig: /r/.systemone.json"));
  assert.ok(formatAnswers(answers).endsWith("\nconfig: none (defaults)"));
});
