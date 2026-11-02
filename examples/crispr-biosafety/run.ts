/**
 * Design SpCas9 guides for a short EGFP fragment, then keyword-scan two BioScript files.
 *
 * Guide scores come from client/src/crispr-guides.ts (the same function the
 * CRISPR panel calls). They are a small heuristic, not Doench Rule Set 2, and
 * off-target counts are only against this fragment.
 *
 * The biosafety scan is client/src/biosecurity-rules.ts: case-insensitive
 * substring search. It is not a sequence alignment to a pathogen database.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findGuideRNAs } from "../../client/src/crispr-guides";
import { scanBiosecurityText } from "../../client/src/biosecurity-rules";

const here = dirname(fileURLToPath(import.meta.url));
const sequence = readFileSync(join(here, "egfp-target.dna"), "utf8")
  .split("\n")
  .filter((line) => !line.startsWith(">"))
  .join("")
  .replace(/\s/g, "")
  .toUpperCase();

const guides = findGuideRNAs(sequence, "SpCas9");
if (guides.length < 1) {
  throw new Error("no SpCas9 guides found in the EGFP fragment");
}
const top = guides[0];
if (top.spacer.length !== 20 || !/^[ACGT]GG$/.test(top.pam)) {
  throw new Error(`unexpected top guide ${top.spacer} PAM ${top.pam}`);
}

function scan(name: string): { file: string; ids: string[]; threats: string[] } {
  const text = readFileSync(join(here, "designs", name), "utf8");
  const findings = scanBiosecurityText(text, name);
  return {
    file: name,
    ids: findings.map((finding) => finding.id),
    threats: findings.map((finding) => `${finding.id} ${finding.threat} ${finding.title}`),
  };
}

const clean = scan("egfp-guide.bio");
const risky = scan("egfp-guide-ccdb.bio");

if (!clean.ids.some((id) => id.startsWith("STRUCT-001"))) {
  throw new Error("clean design should note the missing kill switch");
}
if (!clean.ids.some((id) => id.startsWith("ABR003"))) {
  throw new Error("clean design should show the cat substring hit (ABR003)");
}
if (clean.ids.some((id) => id.startsWith("TOX001"))) {
  throw new Error("clean design should not match CcdB");
}
if (!risky.ids.some((id) => id.startsWith("TOX001"))) {
  throw new Error("CcdB design should match TOX001");
}

const report = {
  sequence_bp: sequence.length,
  guide_count: guides.length,
  top_guides: guides.slice(0, 3).map((guide) => ({
    spacer: guide.spacer,
    pam: guide.pam,
    strand: guide.strand,
    position: guide.position,
    gc: Math.round(guide.gcContent),
    on_target: guide.onTargetScore,
    off_target: guide.offTargetScore,
    overall: guide.overallScore,
  })),
  scans: [clean, risky].map((item) => ({ file: item.file, findings: item.threats })),
};
console.log(JSON.stringify(report, null, 2));
