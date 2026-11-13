import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WORKFLOWS,
  buildCheckQuestions,
  buildGateQuestions,
  buildRouteQuestions,
  computeFinalRisk,
  computeTouchesInvariants,
  mergeAdditions,
} from "../src/questions.js";

const PINNED_RISK = {
  type: "choice",
  instructions: "Rate the risk of running this shell command in a development repository.",
  criteria: {
    safe: "Read-only or trivially reversible: ls, git status, builds, tests",
    needs_confirm:
      "Mutates files, git history, or settings in recoverable ways: edits, commits, branch switches, installs",
    dangerous:
      "Destructive, hard to reverse, or affects shared or remote state: rm -rf, force push, sudo, dropping databases, publishing",
  },
};

test("route uses defaults or the given workflows", () => {
  assert.deepEqual(DEFAULT_WORKFLOWS, {
    build: "New feature, component, or functionality to create",
    bugfix: "Fix a defect, failing test, or unexpected behavior",
    refactor: "Restructure existing code without changing behavior",
    review: "Read and critique code, a design, or a plan",
    docs: "Write or update documentation (README, AGENTS.md, plans)",
    other: "None of the above",
  });
  const q = buildRouteQuestions();
  assert.deepEqual(q.workflow, {
    type: "choice",
    instructions: "Which workflow fits this request?",
    criteria: DEFAULT_WORKFLOWS,
  });
  assert.deepEqual(q.needs_clarification, {
    type: "noul",
    instructions:
      "Is the request too ambiguous to start work without asking the user a clarifying question?",
    criteria: {
      false: "The request is clear enough to start work",
      true: "Essential intent or scope is missing",
    },
  });
  assert.deepEqual(q.urgency, {
    type: "score",
    instructions: "How urgently does this request need to be handled?",
    criteria: [
      "Routine: no time pressure, can be queued",
      "Soon: blocks other work or has a deadline",
      "Immediate: broken build, data loss risk, or blocking incident",
    ],
  });
  const custom = { ship: "S", other: "None of the above" };
  assert.deepEqual(buildRouteQuestions(custom).workflow.criteria, custom);
});

test("gate without invariants has only ready and verdict", () => {
  assert.deepEqual(Object.keys(buildGateQuestions()), ["ready", "verdict"]);
  assert.deepEqual(Object.keys(buildGateQuestions({})), ["ready", "verdict"]);
  assert.deepEqual(buildGateQuestions().verdict.criteria, {
    approve: "Complete, consistent, ready to implement",
    changes: "Usable but needs specific corrections first",
    reject: "Fundamentally flawed or missing critical information",
  });
});

test("gate adds one noul per invariant", () => {
  const q = buildGateQuestions({ a: "A" });
  assert.deepEqual(Object.keys(q), ["ready", "verdict", "invariant.a"]);
  assert.deepEqual(q["invariant.a"], {
    type: "noul",
    instructions: "Does the described change touch this invariant: A",
    criteria: {
      false: "The change does not affect this invariant",
      true: "The change touches or could break this invariant",
    },
  });
});

test("check keeps the fixed base risk and adds one noul per rule", () => {
  assert.deepEqual(buildCheckQuestions(), { risk: PINNED_RISK });
  const q = buildCheckQuestions({ p: { description: "P", level: "dangerous" } });
  assert.deepEqual(q.risk, PINNED_RISK);
  assert.deepEqual(q["rule.p"], {
    type: "noul",
    instructions: "Does this command match this rule: P",
    criteria: {
      false: "The command does not match this rule",
      true: "The command matches this rule",
    },
  });
});

test("mergeAdditions adds, rejects collisions and enforces the combined limit", () => {
  assert.deepEqual(mergeAdditions("invariants", null, undefined), {});
  assert.deepEqual(mergeAdditions("invariants", { a: "A" }, undefined), { a: "A" });
  assert.deepEqual(mergeAdditions("invariants", { a: "A" }, { b: "B" }), { a: "A", b: "B" });
  assert.deepEqual(
    mergeAdditions("risk_rules", null, { x: { description: "X", level: "needs_confirm" } }),
    { x: { description: "X", level: "needs_confirm" } },
  );
  assert.throws(
    () => mergeAdditions("invariants", { x: "A" }, { x: "B" }),
    /caller: invariants id "x" is already defined in the project config/,
  );
  assert.throws(() => mergeAdditions("invariants", null, { "Bad Id": "B" }), /caller: invariants has invalid id/);
  assert.throws(
    () => mergeAdditions("risk_rules", null, { x: { description: "X", level: "safe" } }),
    /caller: risk_rules\.x level must be needs_confirm or dangerous/,
  );
  const ten = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, "d"]));
  const three = { c0: "d", c1: "d", c2: "d" };
  assert.throws(() => mergeAdditions("invariants", ten, three), /at most 12/);
});

test("computeTouchesInvariants takes the max and flags >= 0.5", () => {
  const invariants = { a: "A", b: "B", c: "C" };
  const answers = {
    "invariant.a": { type: "noul", noul: 0.2 },
    "invariant.b": { type: "noul", noul: 0.7 },
    "invariant.c": { type: "noul", noul: 0.5 },
  };
  assert.deepEqual(computeTouchesInvariants(answers, invariants), { p: 0.7, flagged: ["b", "c"] });
  assert.equal(computeTouchesInvariants(answers, {}), null);
  assert.deepEqual(
    computeTouchesInvariants({ "invariant.a": { type: "noul", noul: 0.1 } }, { a: "A" }),
    { p: 0.1, flagged: [] },
  );
});

test("computeTouchesInvariants fails closed on missing or malformed answers", () => {
  assert.deepEqual(computeTouchesInvariants({}, { a: "A" }), { p: 1, flagged: ["a"] });
  assert.deepEqual(
    computeTouchesInvariants({ "invariant.a": { type: "noul", noul: "high" } }, { a: "A" }),
    { p: 1, flagged: ["a"] },
  );
});

function risk(choice) {
  return { risk: { type: "choice", choice } };
}

test("computeFinalRisk never lowers the base", () => {
  assert.deepEqual(computeFinalRisk(risk("safe"), {}), { level: "safe", raisedBy: [] });
  assert.deepEqual(
    computeFinalRisk(
      { ...risk("dangerous"), "rule.x": { type: "noul", noul: 0.9 } },
      { x: { description: "X", level: "needs_confirm" } },
    ),
    { level: "dangerous", raisedBy: [] },
  );
  assert.deepEqual(
    computeFinalRisk(
      { ...risk("safe"), "rule.x": { type: "noul", noul: 0.5 } },
      { x: { description: "X", level: "needs_confirm" } },
    ),
    { level: "needs_confirm", raisedBy: ["x"] },
  );
  assert.deepEqual(
    computeFinalRisk(
      { ...risk("needs_confirm"), "rule.x": { type: "noul", noul: 0.49 } },
      { x: { description: "X", level: "dangerous" } },
    ),
    { level: "needs_confirm", raisedBy: [] },
  );
  assert.deepEqual(
    computeFinalRisk(
      {
        ...risk("safe"),
        "rule.x": { type: "noul", noul: 0.9 },
        "rule.y": { type: "noul", noul: 0.8 },
      },
      { x: { description: "X", level: "needs_confirm" }, y: { description: "Y", level: "dangerous" } },
    ),
    { level: "dangerous", raisedBy: ["y"] },
  );
});

test("computeFinalRisk fails closed on missing answers", () => {
  assert.deepEqual(computeFinalRisk({}, {}), { level: "dangerous", raisedBy: [] });
  assert.deepEqual(computeFinalRisk(risk("unknown"), {}), { level: "dangerous", raisedBy: [] });
  assert.deepEqual(
    computeFinalRisk(risk("safe"), { x: { description: "X", level: "needs_confirm" } }),
    { level: "needs_confirm", raisedBy: ["x"] },
  );
});
