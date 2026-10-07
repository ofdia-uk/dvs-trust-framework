// Tests for why changes were made (lib/change-provenance.js,
// change-provenance.json and scripts/change-provenance.js). Run with: npm test
//
// The first tests check the real register. The rest build a small Git
// repository with a tagged baseline, change it, record the rule identities
// and check what the "What's changed" pages would say about why. They show
// that only recorded explanations are shown, that an explanation follows a
// rule that is renumbered or moved, and that the check fails rather than
// guess when an entry is wrong or out of date.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import { frameworkChanges, FRAMEWORK_DIR } from "../lib/changes.js";
import { frameworkRules, readSections, resolveIdentities, loadRuleIdentities } from "../lib/rule-identities.js";
import { REPOSITORY_URL } from "../lib/markdown.js";
import {
  PROVENANCE_FILE,
  MAX_RATIONALE,
  ChangeProvenanceError,
  readChangeProvenance,
  checkChangeProvenance,
  resolveChangeProvenance,
  loadChangeProvenance,
  formatChangeProvenance,
  nextChangeId,
  tagExists,
} from "../lib/change-provenance.js";
import { apply, referenceNumber, UsageError } from "../scripts/change-provenance.js";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(SITE_DIR, "..");

// --- The real register ----------------------------------------------------------

test("the real register is in order", () => {
  const register = readChangeProvenance(REPO_ROOT);
  assert.ok(Array.isArray(register.changes));
  const changes = { available: true, ...frameworkChanges(REPO_ROOT) };
  const resolved = loadChangeProvenance(REPO_ROOT, loadRuleIdentities(REPO_ROOT), changes);
  assert.ok(resolved.count <= register.changes.length);
  assert.equal(readChangeProvenance(REPO_ROOT).changes.length, register.changes.length);
  assert.equal(fs.readFileSync(path.join(REPO_ROOT, PROVENANCE_FILE), "utf-8").replace(/\r\n/g, "\n"), formatChangeProvenance(register), "the register is written one entry per line");
});

test("the command checks the real register, and refuses a change without touching it", () => {
  const before = fs.readFileSync(path.join(REPO_ROOT, PROVENANCE_FILE));
  const run = (...args) => spawnSync(process.execPath, [path.join(SITE_DIR, "scripts", "change-provenance.js"), ...args], { encoding: "utf-8" });
  assert.equal(run().status, 0);
  const refused = run("record", "--rules", "99.9.z", "--issues", "1");
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /Nothing was changed/);
  assert.deepEqual(fs.readFileSync(path.join(REPO_ROOT, PROVENANCE_FILE)), before);
});

// --- A small repository ----------------------------------------------------------

const S1 = `${FRAMEWORK_DIR}/part-1/01-introduction.md`;
const S11 = `${FRAMEWORK_DIR}/part-3/11-operational-requirements.md`;
const S12 = `${FRAMEWORK_DIR}/part-3/12-service-requirements.md`;
const TEXT = {
  [S1]: "## 1. Introduction\n\n1.1.a. Read the [data schema](https://www.gov.uk/old-schema) first.\n\n1.1.b. You must keep records.\n",
  [S11]: "## 11. Operational requirements\n\n### 11.1. Logs\n\n11.1.a. You must keep logs for a year.\n",
  [S12]: "## 12. Service requirements\n\n### 12.1. Encryption\n\n12.1.a. You must encrypt data at rest.\n\n12.1.b. You must test your controls.\n",
};
const BASELINE = "published-1.0";

/** The identities as they are at the baseline: id → [number, file]. */
const BASE_IDS = {
  r0001: ["12.1.a", S12],
  r0002: ["12.1.b", S12],
  r0003: ["11.1.a", S11],
  r0004: ["1.1.a", S1],
  r0005: ["1.1.b", S1],
};

/** A repository with three sections, tagged published-1.0 (and, on the same commit, published-0.9). */
function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "change-provenance-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  const read = (file) => fs.readFileSync(path.join(root, file), "utf-8");
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.org");
  git("config", "core.autocrlf", "false");
  write("framework-baseline.json", JSON.stringify({ tag: BASELINE, name: "published 1.0" }));
  for (const [file, text] of Object.entries(TEXT)) write(file, text);
  commit("Baseline");
  git("tag", "-a", BASELINE, "-m", "Published 1.0");
  git("tag", "-a", "published-0.9", "-m", "An earlier baseline");
  return { root, git, write, read, commit, edit: (file, from, to) => write(file, read(file).replace(from, to)) };
}

/**
 * The rule identities in the repository now. `places` changes BASE_IDS: id →
 * { number, file, history, status } for rules that were renumbered, moved,
 * added or retired.
 */
function identitiesIn(repo, places = {}) {
  const sections = readSections(repo.root);
  const rules = frameworkRules(sections);
  const fingerprints = Object.fromEntries(rules.map((rule) => [rule.number, rule.fingerprint]));
  const all = { ...Object.fromEntries(Object.entries(BASE_IDS).map(([id, [number, file]]) => [id, { number, file }])), ...places };
  const registry = {
    rules: Object.entries(all)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, place]) =>
        place.status === "retired"
          ? { id, status: "retired", history: place.history }
          : { id, number: place.number, file: place.file, fingerprint: fingerprints[place.number], ...(place.history ? { history: place.history } : {}) },
      ),
  };
  return resolveIdentities(registry, rules, sections.map((section) => section.repoPath));
}

const entry = (fields) => ({ id: "c0001", baseline: BASELINE, ...fields });

/** Check the entries against the repository, and resolve them if they pass. */
function explain(repo, entries, places) {
  const identities = identitiesIn(repo, places);
  const changes = frameworkChanges(repo.root);
  const register = { changes: entries };
  const problems = checkChangeProvenance(register, { identities, changes, baseline: BASELINE, tagExists: (tag) => tagExists(repo.root, tag) });
  return { problems, identities, changes, resolved: problems.length ? null : resolveChangeProvenance(register, identities, changes, BASELINE) };
}

/** Like explain, but the entries must pass. */
function shown(repo, entries, places) {
  const result = explain(repo, entries, places);
  assert.deepEqual(result.problems, [], "the entries are valid");
  return result;
}

/** The changed blocks of a section, each with its rule, kind and the ids of the entries shown under it. */
function blocks({ changes, resolved }, file) {
  const section = changes.sections.find((each) => each.path === file);
  assert.ok(section, `${file} has changed`);
  return section.items.map((item, i) => ({ rule: item.rule, kind: item.kind, why: resolved.bySection[file].items[i].map((view) => view.id) }));
}

const whyFor = (result, file, rule) => blocks(result, file).filter((block) => block.rule === rule).map((block) => block.why);

const fails = (problems, pattern) => assert.ok(problems.some((problem) => pattern.test(problem)), `expected a problem matching ${pattern}, got:\n${problems.join("\n\n")}`);

// --- What is shown ----------------------------------------------------------------

test("one issue and one pull request are shown under the rule they explain, with the approved explanation", () => {
  const repo = repository();
  repo.edit(S12, "data at rest", "data at rest and in transit");
  repo.commit("Change 12.1.a");
  const result = shown(repo, [entry({ rules: ["r0001"], issues: [123], pullRequests: [147], rationale: "Makes clear the rule covers data in transit." })]);
  const { bySection, count } = result.resolved;
  assert.equal(count, 1);
  assert.deepEqual(bySection[S12].section, []);
  assert.equal(bySection[S12].count, 1);
  assert.deepEqual(whyFor(result, S12, "12.1.a"), [["c0001"]]);
  const [view] = bySection[S12].items.find((list) => list.length);
  assert.deepEqual(view, {
    id: "c0001",
    rationale: "Makes clear the rule covers data in transit.",
    issues: [{ number: 123, url: `${REPOSITORY_URL}/issues/123` }],
    pullRequests: [{ number: 147, url: `${REPOSITORY_URL}/pull/147` }],
  });
});

test("several issues and pull requests are all shown, the explanation is optional, and a change with no entry shows nothing", () => {
  const repo = repository();
  repo.edit(S12, "data at rest", "data at rest and in transit");
  repo.edit(S12, "test your controls", "test your controls every year");
  repo.commit("Change 12.1.a and 12.1.b");
  const result = shown(repo, [entry({ rules: ["r0001"], issues: [123, 130], pullRequests: [147, 150] })]);
  assert.deepEqual(whyFor(result, S12, "12.1.a"), [["c0001"]]);
  assert.deepEqual(whyFor(result, S12, "12.1.b"), [[]], "nothing is shown for a change no one has explained");
  const [view] = result.resolved.bySection[S12].items[blocks(result, S12).findIndex((block) => block.rule === "12.1.a")];
  assert.equal(view.rationale, null);
  assert.deepEqual(view.issues.map((issue) => issue.number), [123, 130]);
  assert.deepEqual(view.pullRequests.map((pr) => pr.url), [`${REPOSITORY_URL}/pull/147`, `${REPOSITORY_URL}/pull/150`]);
});

test("with nothing recorded, nothing is shown", () => {
  const repo = repository();
  repo.edit(S12, "data at rest", "data at rest and in transit");
  repo.commit("Change 12.1.a");
  const result = shown(repo, []);
  assert.equal(result.resolved.count, 0);
  assert.deepEqual(result.resolved.bySection[S12], { count: 0, section: [], items: [[]] });
});

test("one entry can explain several rules, and a rule changed twice shows both entries, oldest first", () => {
  const repo = repository();
  repo.edit(S12, "data at rest", "data at rest and in transit");
  repo.edit(S12, "test your controls", "test your controls every year");
  repo.commit("Change both rules");
  const result = shown(repo, [entry({ rules: ["r0001", "r0002"], issues: [5], pullRequests: [10] }), entry({ id: "c0002", rules: ["r0002"], pullRequests: [11] })]);
  assert.deepEqual(whyFor(result, S12, "12.1.a"), [["c0001"]]);
  assert.deepEqual(whyFor(result, S12, "12.1.b"), [["c0001", "c0002"]]);
  assert.equal(result.resolved.bySection[S12].count, 2);
});

test("an entry follows its rule when the rule is later renumbered, with no change to the entry", () => {
  const repo = repository();
  repo.edit(S12, "test your controls", "test your controls every year");
  repo.commit("Change 12.1.b");
  const entries = [entry({ rules: ["r0002"], issues: [8], pullRequests: [9] })];
  assert.deepEqual(whyFor(shown(repo, entries), S12, "12.1.b"), [["c0001"]]);

  // A rule is inserted as 12.1.a, so 12.1.a becomes 12.1.b and 12.1.b becomes 12.1.c.
  repo.edit(S12, "12.1.b. You must", "12.1.c. You must");
  repo.edit(S12, "12.1.a. You must encrypt", "12.1.a. You must have a policy.\n\n12.1.b. You must encrypt");
  repo.commit("Insert a rule");
  const renumbered = {
    r0001: { number: "12.1.b", file: S12, history: [{ number: "12.1.a", file: S12 }] },
    r0002: { number: "12.1.c", file: S12, history: [{ number: "12.1.b", file: S12 }] },
    r0006: { number: "12.1.a", file: S12 },
  };
  const result = shown(repo, entries, renumbered);
  assert.deepEqual(whyFor(result, S12, "12.1.c"), [["c0001"]], "shown under the rule's new number");
  assert.deepEqual(whyFor(result, S12, "12.1.a"), [[]], "not under the rule that now has its old number");
  assert.deepEqual(whyFor(result, S12, "12.1.b"), [[]]);
});

test("a rule moved to another section is explained on both sections' pages", () => {
  const repo = repository();
  repo.edit(S12, "\n\n12.1.b. You must test your controls.", "");
  repo.edit(S11, "for a year.\n", "for a year.\n\n11.1.b. You must test your controls.\n");
  repo.commit("Move 12.1.b to section 11");
  const result = shown(repo, [entry({ rules: ["r0002"], issues: [21] })], { r0002: { number: "11.1.b", file: S11, history: [{ number: "12.1.b", file: S12 }] } });
  assert.deepEqual(blocks(result, S12), [{ rule: "12.1.b", kind: "removed", why: ["c0001"] }]);
  assert.deepEqual(blocks(result, S11), [{ rule: "11.1.b", kind: "added", why: ["c0001"] }]);
  assert.equal(result.resolved.count, 1, "one entry, shown in two places");
});

test("a removed rule's entry explains its removal", () => {
  const repo = repository();
  repo.edit(S12, "\n\n12.1.b. You must test your controls.", "");
  repo.commit("Remove 12.1.b");
  const result = shown(repo, [entry({ rules: ["r0002"], rationale: "Covered by rule 12.1.a." })], { r0002: { status: "retired", history: [{ number: "12.1.b", file: S12 }] } });
  assert.deepEqual(blocks(result, S12), [{ rule: "12.1.b", kind: "removed", why: ["c0001"] }]);
});

test("a change that is not to a numbered rule is explained for its section as a whole", () => {
  const repo = repository();
  repo.edit(S12, "### 12.1. Encryption", "### 12.1. Encryption and keys");
  repo.commit("Change a heading");
  const result = shown(repo, [entry({ sections: [S12], issues: [3] })]);
  assert.deepEqual(result.resolved.bySection[S12].section.map((view) => view.id), ["c0001"]);
  assert.deepEqual(blocks(result, S12), [{ rule: null, kind: "changed", why: [] }]);
});

test("link-only and formatting-only changes can be explained, and keep their classification", () => {
  const repo = repository();
  repo.edit(S1, "old-schema", "new-schema");
  repo.edit(S1, "You must keep", "You **must** keep");
  repo.commit("Change a link and some formatting");
  const before = structuredClone(frameworkChanges(repo.root));
  const result = shown(repo, [entry({ rules: ["r0004"], issues: [31] }), entry({ id: "c0002", rules: ["r0005"], pullRequests: [32] })]);
  assert.deepEqual(blocks(result, S1), [
    { rule: "1.1.a", kind: "link", why: ["c0001"] },
    { rule: "1.1.b", kind: "formatting", why: ["c0002"] },
  ]);
  assert.deepEqual(result.changes, before, "explaining changes does not alter what changed or how it is classified");
  assert.equal(result.changes.sections[0].summary, "1 link changed, 1 formatting change.");
});

test("a section file that moved unchanged is explained by its file, not its rules", () => {
  const repo = repository();
  const moved = `${FRAMEWORK_DIR}/part-3/11-operations.md`;
  repo.git("mv", S11, moved);
  repo.commit("Rename section 11");
  const places = { r0003: { number: "11.1.a", file: moved, history: [{ number: "11.1.a", file: S11 }] } };
  fails(explain(repo, [entry({ rules: ["r0003"], pullRequests: [40] })], places).problems, /r0003 \(rule 11\.1\.a\) has not changed since published-1\.0: only its section file has moved\. To explain the move, list ".*11-operations\.md" in "sections"/);
  for (const file of [moved, S11]) {
    const result = shown(repo, [entry({ sections: [file], pullRequests: [40] })], places);
    assert.deepEqual(result.resolved.bySection[moved].section.map((view) => view.id), ["c0001"], `given as ${file}`);
  }
});

test("entries for an earlier baseline are kept as a record and not shown, but must name a tag that exists", () => {
  const repo = repository();
  repo.edit(S12, "data at rest", "data at rest and in transit");
  repo.commit("Change 12.1.a");
  const result = shown(repo, [entry({ baseline: "published-0.9", rules: ["r0003"], pullRequests: [2] })]);
  assert.equal(result.resolved.count, 0);
  assert.deepEqual(whyFor(result, S12, "12.1.a"), [[]]);
  fails(explain(repo, [entry({ baseline: "published-0.8", rules: ["r0003"], pullRequests: [2] })]).problems, /"baseline" is published-0\.8, but there is no such tag/);
});

// --- What fails -------------------------------------------------------------------

/** A repository where 12.1.a has changed, for checking entries. */
const changedRepo = (() => {
  let repo;
  return () => {
    if (!repo) {
      repo = repository();
      repo.edit(S12, "data at rest", "data at rest and in transit");
      repo.commit("Change 12.1.a");
    }
    return repo;
  };
})();
/** Problems with entries in that repository. The comparison is made once, as it does not change. */
const problemsWith = (() => {
  let compared;
  return (entries, places) => {
    if (places) return explain(changedRepo(), entries, places).problems;
    compared ??= { identities: identitiesIn(changedRepo()), changes: frameworkChanges(changedRepo().root) };
    return checkChangeProvenance({ changes: entries }, { ...compared, baseline: BASELINE, tagExists: (tag) => tagExists(changedRepo().root, tag) });
  };
})();

test("an entry for a rule or section that has not changed since the baseline fails", () => {
  fails(problemsWith([entry({ rules: ["r0002"], pullRequests: [1] })]), /show no change to r0002 \(rule 12\.1\.b\) since published-1\.0, so there is no change to explain/);
  fails(problemsWith([entry({ sections: [S11], pullRequests: [1] })]), /11-operational-requirements\.md has not changed since published-1\.0/);
  fails(
    problemsWith([entry({ rules: ["r0009"], pullRequests: [1] })], { r0009: { status: "retired", history: [{ number: "12.9.a", file: S12 }] } }),
    /no change to r0009 \(rule 12\.9\.a when it was removed\)/,
  );
});

test("an identity that does not exist, or a rule number instead of an identity, fails and says what to use", () => {
  fails(problemsWith([entry({ rules: ["r0999"], pullRequests: [1] })]), /r0999 is not in rule-identities\.json/);
  fails(problemsWith([entry({ rules: ["12.1.a"], pullRequests: [1] })]), /not rule numbers.*Rule 12\.1\.a is r0001: use "r0001"/);
  fails(problemsWith([entry({ rules: ["99.1.a"], pullRequests: [1] })]), /No rule in the working draft has the number 99\.1\.a/);
});

test("malformed registers and entries fail, each with what to change", () => {
  const compared = { identities: identitiesIn(changedRepo()), changes: frameworkChanges(changedRepo().root), baseline: BASELINE };
  const check = (register) => checkChangeProvenance(register, compared);
  for (const register of [null, [], {}, { changes: {} }]) fails(check(register), /must be an object with a "changes" list/);
  fails(check({ changes: [], extra: 1 }), /unexpected field "extra"/);
  const ok = { rules: ["r0001"], pullRequests: [1] };
  for (const [name, entries, pattern] of [
    ["not an object", ["c0001"], /Entry 1 in "changes" is not an object/],
    ["an unknown field", [entry({ ...ok, title: "x" })], /unexpected field "title"/],
    ["a malformed id", [entry({ ...ok, id: "1" })], /"id" must be c followed by at least four digits/],
    ["a repeated id", [entry(ok), entry({ rules: ["r0001"], pullRequests: [2] })], /the id c0001 is already used by entry 1/],
    ["no baseline", [{ id: "c0001", ...ok }], /"baseline" must be the tag the change was made against, such as "published-1\.0"/],
    ["nothing changed", [entry({ pullRequests: [1] })], /it must say what changed/],
    ["no reason", [entry({ rules: ["r0001"] })], /it must say why/],
    ["an empty list", [entry({ rules: [], pullRequests: [1] })], /"rules" must be a list with at least one item/],
    ["a list that is not a list", [entry({ rules: "r0001", pullRequests: [1] })], /"rules" must be a list/],
    ["a repeated issue", [entry({ rules: ["r0001"], issues: [4, 4] })], /"issues" lists the same item more than once/],
    ["an issue as a string", [entry({ rules: ["r0001"], issues: ["#123"] })], /"#123" must be written as the issue's number alone.*: 123\./],
    ["an issue as an address", [entry({ rules: ["r0001"], issues: [`${REPOSITORY_URL}/issues/123`] })], /must be written as the issue's number alone.*: 123\./],
    ["a pull request as an address", [entry({ rules: ["r0001"], pullRequests: [`${REPOSITORY_URL}/pull/147`] })], /must be written as the pull request's number alone.*: 147\./],
    ["zero", [entry({ rules: ["r0001"], pullRequests: [0] })], /0 is not the number of a pull request/],
    ["a fraction", [entry({ rules: ["r0001"], pullRequests: [1.5] })], /1\.5 is not the number of a pull request/],
    ["words", [entry({ rules: ["r0001"], issues: ["soon"] })], /"soon" is not the number of an issue on GitHub/],
    ["an explanation on two lines", [entry({ ...ok, rationale: "One.\nTwo." })], /"rationale" must be a short explanation on one line/],
    ["an empty explanation", [entry({ ...ok, rationale: "  " })], /"rationale" must be a short explanation/],
    ["an explanation that is not text", [entry({ ...ok, rationale: 5 })], /"rationale" must be a short explanation/],
    ["a long explanation", [entry({ ...ok, rationale: "x".repeat(MAX_RATIONALE + 1) })], new RegExp(`"rationale" is ${MAX_RATIONALE + 1} characters long`)],
    ["a section that is not a file", [entry({ sections: ["12"], pullRequests: [1] })], /"12" in "sections" is not a file of the trust framework/],
    ["a rule that is not an identity", [entry({ rules: ["rule a"], pullRequests: [1] })], /"rule a" in "rules" is not a permanent identity/],
  ]) {
    fails(check({ changes: entries }), pattern);
    assert.ok(check({ changes: entries }).length, name);
  }
});

test("the same number as an issue and a pull request fails, in one entry or across entries", () => {
  fails(problemsWith([entry({ rules: ["r0001"], issues: [147], pullRequests: [147] })]), /#147 is listed as a pull request here, but as an issue in c0001/);
  fails(
    problemsWith([entry({ rules: ["r0001"], issues: [147] }), entry({ id: "c0002", rules: ["r0001"], pullRequests: [147] })]),
    /c0002\): #147 is listed as a pull request here, but as an issue in c0001\. Issues and pull requests share numbers on GitHub/,
  );
});

test("the same change explained twice fails, but separate pull requests on one rule do not", () => {
  fails(
    problemsWith([entry({ rules: ["r0001"], pullRequests: [147], rationale: "One" }), entry({ id: "c0002", rules: ["r0001"], issues: [5], pullRequests: [147] })]),
    /c0002\): rule r0001 \(rule 12\.1\.a\) is already explained by pull request #147 in Entry 1 in "changes" \(c0001\)/,
  );
  fails(problemsWith([entry({ rules: ["r0001"], issues: [5] }), entry({ id: "c0002", rules: ["r0001"], issues: [5] })]), /is already explained by issue #5/);
  fails(problemsWith([entry({ rules: ["r0001"], rationale: "A" }), entry({ id: "c0002", rules: ["r0001"], rationale: "B" })]), /already explained by an explanation with no issue or pull request/);
  assert.deepEqual(problemsWith([entry({ rules: ["r0001"], issues: [5], pullRequests: [147] }), entry({ id: "c0002", rules: ["r0001"], issues: [5], pullRequests: [160] })]), []);
});

test("a register that cannot be read stops the build, and so does a wrong entry", () => {
  assert.throws(() => readChangeProvenance(path.join(SITE_DIR, "test", "no-such-folder")), (error) => error instanceof ChangeProvenanceError && error.message.includes(`${PROVENANCE_FILE} cannot be read`));
  const repo = changedRepo();
  fs.writeFileSync(path.join(repo.root, PROVENANCE_FILE), formatChangeProvenance({ changes: [entry({ rules: ["r0002"], pullRequests: [1] })] }));
  const identities = identitiesIn(repo);
  assert.throws(
    () => loadChangeProvenance(repo.root, identities, { available: true, ...frameworkChanges(repo.root) }),
    (error) => error instanceof ChangeProvenanceError && /See ARCHITECTURE\.md, under Why a change was made/.test(error.message) && error.problems.length === 1,
  );
  // Without the comparison (a local build without the Git history), the entries are still checked, but nothing is shown.
  assert.deepEqual(loadChangeProvenance(repo.root, identities, { available: false, sections: [] }), { count: 0, bySection: {} });
  fs.writeFileSync(path.join(repo.root, PROVENANCE_FILE), formatChangeProvenance({ changes: [entry({ rules: ["12.1.b"], pullRequests: [1] })] }));
  assert.throws(() => loadChangeProvenance(repo.root, identities, { available: false, sections: [] }), ChangeProvenanceError);
  fs.rmSync(path.join(repo.root, PROVENANCE_FILE));
});

// --- Recording an entry ----------------------------------------------------------

function context(repo, places) {
  const identities = identitiesIn(repo, places);
  const changes = frameworkChanges(repo.root);
  return {
    identities,
    sectionPaths: [S1, S11, S12],
    baseline: BASELINE,
    check: (register) => checkChangeProvenance(register, { identities, changes, baseline: BASELINE }),
  };
}

test("record turns rule numbers into identities and accepts #123 and addresses, and correct and remove change only what they say", () => {
  const repo = changedRepo();
  const ctx = context(repo);
  const register = { about: "About.", changes: [] };
  apply(register, ctx, "record", [
    "--rules", "Rule 12.1.a.",
    "--issues", "#123", `${REPOSITORY_URL}/issues/130`,
    "--pr", `${REPOSITORY_URL}/pull/147`,
    "--rationale", "  Covers data in transit.  ",
  ]);
  assert.deepEqual(register.changes, [{ id: "c0001", baseline: BASELINE, rules: ["r0001"], issues: [123, 130], pullRequests: [147], rationale: "Covers data in transit." }]);

  apply(register, ctx, "record", ["c0001", "--pr", "148"]);
  assert.deepEqual(register.changes[0].pullRequests, [148]);
  assert.equal(register.changes[0].rationale, "Covers data in transit.", "what is not given is kept");
  apply(register, ctx, "record", ["c0001", "--rationale", ""]);
  assert.equal("rationale" in register.changes[0], false, "an empty explanation removes it");

  apply(register, ctx, "record", ["--sections", "12", "--pr", "150"]);
  assert.deepEqual(register.changes[1], { id: "c0002", baseline: BASELINE, sections: [S12], pullRequests: [150] });

  assert.equal(
    formatChangeProvenance(register),
    `{\n  "about": "About.",\n  "changes": [\n    {"id":"c0001","baseline":"published-1.0","rules":["r0001"],"issues":[123,130],"pullRequests":[148]},\n    {"id":"c0002","baseline":"published-1.0","sections":["${S12}"],"pullRequests":[150]}\n  ]\n}\n`,
  );
  apply(register, ctx, "remove", ["c0001"]);
  assert.deepEqual(register.changes.map((each) => each.id), ["c0002"]);
  assert.equal(nextChangeId(register), "c0003");
  assert.equal(nextChangeId({ changes: [] }), "c0001");
});

test("record gives a removed rule's identity for the number it last had", () => {
  const repo = repository();
  repo.edit(S12, "\n\n12.1.b. You must test your controls.", "");
  repo.commit("Remove 12.1.b");
  const ctx = context(repo, { r0002: { status: "retired", history: [{ number: "12.1.b", file: S12 }] } });
  const register = { changes: [] };
  apply(register, ctx, "record", ["--rules", "12.1.b", "--rationale", "No longer needed."]);
  assert.deepEqual(register.changes[0].rules, ["r0002"]);
});

test("record refuses anything that would leave the register wrong, and changes nothing", () => {
  const ctx = context(changedRepo());
  const register = { changes: [entry({ rules: ["r0001"], pullRequests: [147] })] };
  const before = structuredClone(register);
  for (const [args, pattern] of [
    [["--rules", "12.1.b", "--pr", "1"], /no change to r0002/],
    [["--rules", "99.1.a", "--pr", "1"], /No rule in the working draft has the number 99\.1\.a/],
    [["--rules", "12.1.a", "--issues", "https://github.com/someone/else/issues/4"], /is in another repository/],
    [["--rules", "12.1.a", "--issues", `${REPOSITORY_URL}/pull/4`], /is a pull request\. Give it with --pr/],
    [["--rules", "12.1.a", "--pr", `${REPOSITORY_URL}/issues/4`], /is an issue\. Give it with --issues/],
    [["--rules", "12.1.a", "--pr", "soon"], /Give the pull request's number on GitHub/],
    [["--rules", "12.1.a", "--pr", "147"], /already explained by pull request #147/],
    [["--rules", "12.1.a", "--rationale", "a", "b"], /--rationale takes one value/],
    [["--rules"], /--rules needs at least one value/],
    [[], /Say what to record/],
    [["c0009", "--pr", "1"], /c0009 is not in change-provenance\.json/],
    [["oops", "--pr", "1"], /"oops" is not an entry/],
    [["--title", "x"], /Unexpected "--title"/],
  ]) {
    assert.throws(() => apply(register, ctx, "record", args), (error) => error instanceof UsageError && pattern.test(error.message), args.join(" "));
  }
  assert.throws(() => apply(register, ctx, "remove", ["c0009"]), /nothing to remove/);
  assert.throws(() => apply(register, ctx, "forget", []), /Unknown command/);
  assert.deepEqual(register, before);
});

test("issue and pull request numbers are read from #123 or an address in this repository only", () => {
  assert.equal(referenceNumber("123", "issues"), 123);
  assert.equal(referenceNumber(" #123 ", "issues"), 123);
  assert.equal(referenceNumber(`${REPOSITORY_URL}/issues/123#issuecomment-1`, "issues"), 123);
  assert.equal(referenceNumber(`${REPOSITORY_URL}/pull/147/`, "pullRequests"), 147);
  for (const bad of ["0", "-1", "1.5", "#", "", "https://example.com/issues/1"]) assert.throws(() => referenceNumber(bad, "issues"), UsageError, bad);
});

// --- On the site ------------------------------------------------------------------

const templates = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(SITE_DIR, "_includes")), { autoescape: true, throwOnUndefined: false });
const renderWhy = (entries, level = 3, heading = "Why this changed") =>
  templates.renderString(`{% from "components/change-provenance.njk" import whyThisChanged %}{{ whyThisChanged(entries, level, heading) }}`, { entries, level, heading });
const view = (id, fields) => ({ id, rationale: null, issues: [], pullRequests: [], ...fields });
const issue = (number) => ({ number, url: `${REPOSITORY_URL}/issues/${number}` });
const pull = (number) => ({ number, url: `${REPOSITORY_URL}/pull/${number}` });
const text = (html) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

test("nothing is shown for a change with no entry", () => {
  for (const entries of [[], undefined, null]) assert.equal(renderWhy(entries).trim(), "");
});

test("an entry is shown under a heading, with its explanation and links to the issues and pull requests on GitHub", () => {
  const html = renderWhy([view("c0001", { rationale: "Makes clear the rule covers data in transit.", issues: [issue(123)], pullRequests: [pull(147)] })]);
  assert.match(html, /<div class="app-why" data-provenance>\s*<h3 class="govuk-heading-s app-why__heading">Why this changed<\/h3>/);
  assert.match(html, /<div class="app-why__entry" data-provenance-entry="c0001">/);
  assert.match(html, /<p class="govuk-body-s app-why__rationale" data-provenance-rationale>Makes clear the rule covers data in transit\.<\/p>/);
  assert.ok(html.includes(`<a class="govuk-link" href="${REPOSITORY_URL}/issues/123" data-provenance-issue="123">issue #123</a>`));
  assert.ok(html.includes(`<a class="govuk-link" href="${REPOSITORY_URL}/pull/147" data-provenance-pull="147">pull request #147</a>`));
  assert.equal(text(html), "Why this changed Makes clear the rule covers data in transit. Raised in issue #123 on GitHub. Reviewed and accepted in pull request #147 on GitHub.");
});

test("several issues, pull requests and entries read as sentences, and parts not given are left out", () => {
  const html = renderWhy(
    [view("c0001", { issues: [issue(1), issue(2), issue(3)], pullRequests: [pull(4), pull(5)] }), view("c0002", { rationale: "Only an explanation." })],
    2,
    "Why this section changed",
  );
  assert.match(html, /<h2 class="govuk-heading-s app-why__heading">Why this section changed<\/h2>/);
  assert.equal(
    text(html),
    "Why this section changed Raised in issue #1, issue #2 and issue #3 on GitHub. Reviewed and accepted in pull request #4 and pull request #5 on GitHub. Only an explanation.",
  );
  assert.equal((html.match(/data-provenance-entry=/g) ?? []).length, 2);
  assert.equal((html.match(/data-provenance-rationale/g) ?? []).length, 1);
});

test("explanations are shown as text, never as HTML", () => {
  const rationale = `<script>alert("x")</script> & <b>bold</b> "quoted"`;
  assert.deepEqual(problemsWith([entry({ rules: ["r0001"], rationale })]), []);
  const html = renderWhy([view("c0001", { rationale })]);
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt; &quot;quoted&quot;"));
  assert.doesNotMatch(html, /<script|<b>/);
});

test("the change page shows entries for the section and under each change", () => {
  const page = fs.readFileSync(path.join(SITE_DIR, "pages", "changes-section.njk"), "utf-8");
  assert.match(page, /\{% set why = changeProvenance\.bySection\[section\.path\] %\}/);
  assert.match(page, /whyThisChanged\(why\.section if why else \[\], 2, "Why this section changed"\)/);
  assert.match(page, /whyThisChanged\(why\.items\[loop\.index0\] if why else \[\], 3, "Why this changed"\)/);
});
