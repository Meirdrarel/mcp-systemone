function round(value) {
  return Math.round(value * 1000) / 1000;
}

function renderAnswer(key, answer) {
  if (answer.type === "choice") {
    const prob =
      answer.probabilities && answer.probabilities[answer.choice] !== undefined
        ? ` (P=${round(answer.probabilities[answer.choice])}`
        : "";
    const conf =
      answer.confidence !== undefined
        ? `${prob ? ", " : " ("}confidence=${round(answer.confidence)})`
        : prob
          ? ")"
          : "";
    return `${key}: ${answer.choice}${prob}${conf}`;
  }
  if (answer.type === "noul") {
    return `${key}: ${answer.noul >= 0.5 ? "yes" : "no"} (P(true)=${round(answer.noul)})`;
  }
  if (answer.type === "score") {
    return `${key}: ${round(answer.score)} (score)`;
  }
  return `${key}: ${JSON.stringify(answer)}`;
}

function renderComputed(computed) {
  const lines = [];
  const touches = computed.touches_invariants;
  if (touches) {
    const flagged = touches.flagged.length > 0 ? `; flagged: ${touches.flagged.join(", ")}` : "";
    lines.push(`touches_invariants: ${touches.flagged.length > 0 ? "yes" : "no"} (P=${round(touches.p)}${flagged})`);
  }
  const risk = computed.final_risk;
  if (risk) {
    const raised = risk.raisedBy.length > 0 ? ` (raised by: ${risk.raisedBy.join(", ")})` : "";
    lines.push(`final_risk: ${risk.level}${raised}`);
  }
  return lines;
}

/**
 * Render a tool result: computed lines, one line per answer, the raw JSON
 * (answers plus `computed` when present), then the `config:` footer.
 */
export function formatAnswers(answers, { computed = {}, configPath = null } = {}) {
  const lines = [
    ...renderComputed(computed),
    ...Object.entries(answers).map(([key, answer]) => renderAnswer(key, answer)),
  ];
  const raw = Object.keys(computed).length > 0 ? { ...answers, computed } : answers;
  const footer = `config: ${configPath ?? "none (defaults)"}`;
  return `${lines.join("\n")}\n\n\`\`\`json\n${JSON.stringify(raw, null, 2)}\n\`\`\`\n\n${footer}`;
}
