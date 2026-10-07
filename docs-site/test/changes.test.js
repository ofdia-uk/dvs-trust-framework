// Tests for lib/changes.js. Run with: npm test
//
// Each test builds a small Git repository with a tagged baseline, changes it,
// and checks what the site would say about the trust framework.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { frameworkChanges, readBaseline, FrameworkChangesError, FRAMEWORK_DIR } from "../lib/changes.js";
import { SITE_URL } from "../lib/feedback.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const banner = (wording) =>
  `<!-- caution-banner:start (wording is kept in tools/caution-banner.md; edit it there) -->\n> [!CAUTION]\n> ${wording}\n<!-- caution-banner:end -->\n\n`;
const footer = (links) => `\n---\n\n**Repository navigation**\n\n${links}\n`;

const S12 = `${FRAMEWORK_DIR}/part-3/12-service-requirements.md`;
const S1 = `${FRAMEWORK_DIR}/part-1/01-introduction.md`;
const S12_TEXT = [
  "## 12. Service requirements",
  "",
  '<a id="section-12_1"></a>',
  "",
  "### 12.1. Encryption",
  "",
  "12.1.a. You must encrypt data at rest.",
  "",
  "12.1.b. You must test your controls.",
  "",
  "- every year;",
  "",
  "- after a change.",
  "",
].join("\n");
const S1_TEXT = "## 1. Introduction\n\n1.1.a. The trust framework helps people use digital identities.\n";

const framework = (text, { bannerWording = "Working draft.", footerLinks = "[Home](../../README.md)" } = {}) =>
  banner(bannerWording) + text + footer(footerLinks);

/** A repository with framework files, a baseline file and an annotated published-1.0 tag. */
function repository({ tag = "annotated", s1 = S1_TEXT } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "framework-changes-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  const commit = (message, date) => {
    git("add", "-A");
    const env = date ? { ...process.env, GIT_AUTHOR_DATE: `${date}T12:00:00Z`, GIT_COMMITTER_DATE: `${date}T12:00:00Z` } : process.env;
    execFileSync("git", ["commit", "-q", "-m", message], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.org");
  git("config", "core.autocrlf", "false");
  write("framework-baseline.json", JSON.stringify({ tag: "published-1.0", name: "published 1.0" }));
  write(S12, framework(S12_TEXT));
  write(S1, framework(s1));
  write("docs-site/README.md", "Site\n");
  commit("Baseline");
  if (tag === "annotated") git("tag", "-a", "published-1.0", "-m", "Published 1.0");
  if (tag === "lightweight") git("tag", "published-1.0");
  return { root, git, write, commit, read: (file) => fs.readFileSync(path.join(root, file), "utf-8") };
}

/** Facts that must hold for any result, so the output can never contradict itself. */
function assertConsistent(result) {
  assert.equal(result.unchanged, result.sections.length === 0, "unchanged exactly when no section is listed");
  if (result.unchanged) assert.equal(result.current.lastChanged, null, "no 'last changed' date when unchanged");
  const paths = result.sections.map((section) => section.path);
  const slugs = result.sections.map((section) => section.slug);
  assert.equal(new Set(paths).size, paths.length, "each file is listed once");
  assert.equal(new Set(slugs).size, slugs.length, "each change page address is used once");
  for (const section of result.sections) {
    assert.ok(section.path.startsWith(`${FRAMEWORK_DIR}/`), `only framework files are listed: ${section.path}`);
    assert.ok(["added", "removed", "changed", "moved"].includes(section.status));
    assert.ok(section.summary);
  }
}

const changes = (repo) => {
  const result = frameworkChanges(repo.root);
  assertConsistent(result);
  return result;
};

test("unchanged when only repository files change, however many", () => {
  const repo = repository();
  for (let i = 0; i < 300; i++) repo.write(`docs-site/generated/file-${i}.txt`, `${i}\n`);
  repo.write(".github/workflows/site.yml", "name: site\n");
  repo.commit("Lots of repository-only work");
  const result = changes(repo);
  assert.equal(result.unchanged, true);
  assert.deepEqual(result.sections, []);
});

test("unchanged when only the caution banner changes in every framework file", () => {
  const repo = repository();
  repo.write(S12, framework(S12_TEXT, { bannerWording: "A completely new banner." }));
  repo.write(S1, framework(S1_TEXT, { bannerWording: "A completely new banner." }));
  repo.commit("Update the caution banner");
  assert.equal(changes(repo).unchanged, true);
});

test("unchanged when only the repository navigation footer or line endings change", () => {
  const repo = repository();
  repo.write(S12, framework(S12_TEXT, { footerLinks: "[Previous](11.md) · [Next](13.md)" }));
  repo.write(S1, framework(S1_TEXT).replace(/\n/g, "\r\n"));
  repo.commit("Footer and line endings");
  assert.equal(changes(repo).unchanged, true);
});

test("a changed rule is listed, with its number, a link to its anchor and the changed words", () => {
  const repo = repository();
  repo.write(S12, framework(S12_TEXT.replace("encrypt data at rest", "encrypt data at rest and in transit")));
  repo.commit("Change rule 12.1.a");
  const { unchanged, sections } = changes(repo);
  assert.equal(unchanged, false);
  assert.equal(sections.length, 1);
  const [section] = sections;
  assert.equal(section.path, S12);
  assert.equal(section.status, "changed");
  assert.equal(section.title, "12. Service requirements");
  assert.equal(section.url, "/trust-framework-1.0/part-3/12-service-requirements/");
  assert.equal(section.slug, "12-service-requirements");
  assert.equal(section.summary, "1 rule changed.");
  const [item] = section.items;
  assert.equal(item.kind, "changed");
  assert.equal(item.rule, "12.1.a");
  assert.equal(item.oldRule, "12.1.a", "the rule's number in the baseline");
  assert.equal(item.anchor, "section-12_1_a");
  assert.equal(item.heading, "12.1. Encryption");
  assert.equal(item.parts.filter((part) => part.added).map((part) => part.text.trim()).join(" "), "and in transit");
  assert.equal(item.parts.some((part) => part.removed), false);
});

test("added and removed rules are listed, and a removed rule has no anchor to link to", () => {
  const repo = repository();
  repo.write(S12, framework(S12_TEXT.replace("12.1.b. You must test your controls.\n\n- every year;\n\n- after a change.\n", "12.1.c. A new rule.\n")));
  repo.commit("Replace 12.1.b with 12.1.c");
  const [section] = changes(repo).sections;
  const byRule = Object.fromEntries(section.items.filter((item) => item.rule).map((item) => [item.rule, item]));
  assert.ok(byRule["12.1.c"], "the new rule is listed");
  assert.equal(byRule["12.1.c"].anchor, "section-12_1_c");
  assert.equal(byRule["12.1.c"].oldRule, "12.1.b", "the block it replaced had 12.1.b in the baseline");
  const removedText = section.items.filter((item) => item.kind === "removed" || item.kind === "changed").flatMap((item) => item.parts).filter((p) => p.removed).map((p) => p.text).join(" ");
  assert.match(removedText, /every year/, "the removed list items are shown as removed");
});

test("added, removed and renamed framework files are listed", () => {
  const repo = repository();
  repo.write(`${FRAMEWORK_DIR}/part-4/17-new-section.md`, framework("## 17. A new section\n\n17.1.a. New.\n"));
  fs.rmSync(path.join(repo.root, S1));
  repo.git("add", "-A");
  repo.git("mv", S12, `${FRAMEWORK_DIR}/part-3/12-service-requirements-moved.md`);
  repo.commit("Add, remove and move");
  const sections = changes(repo).sections;
  const status = Object.fromEntries(sections.map((section) => [section.path, section]));
  assert.equal(status[`${FRAMEWORK_DIR}/part-4/17-new-section.md`].status, "added");
  assert.equal(status[S1].status, "removed");
  assert.equal(status[S1].url, null);
  const moved = status[`${FRAMEWORK_DIR}/part-3/12-service-requirements-moved.md`];
  assert.equal(moved.status, "moved");
  assert.equal(moved.oldPath, S12);
  assert.deepEqual(moved.items, []);
});

test("a file that is moved and changed is listed as removed from its old place and added at its new one", () => {
  const repo = repository();
  repo.git("mv", S12, `${FRAMEWORK_DIR}/part-3/12-moved.md`);
  repo.write(`${FRAMEWORK_DIR}/part-3/12-moved.md`, framework(S12_TEXT.replace("test your controls", "test your controls regularly")));
  repo.commit("Move and change");
  const status = Object.fromEntries(changes(repo).sections.map((section) => [section.path, section.status]));
  assert.deepEqual(status, { [S12]: "removed", [`${FRAMEWORK_DIR}/part-3/12-moved.md`]: "added" });
});

test("a deleted section and an unrelated new one are not mistaken for a move, despite the shared banner and footer", () => {
  const repo = repository();
  fs.rmSync(path.join(repo.root, S1));
  repo.write(`${FRAMEWORK_DIR}/part-1/02-other.md`, framework("## 2. Other\n\n2.1.a. Something else.\n"));
  repo.commit("Remove one section, add another");
  const status = Object.fromEntries(changes(repo).sections.map((section) => [section.path, section.status]));
  assert.deepEqual(status, { [S1]: "removed", [`${FRAMEWORK_DIR}/part-1/02-other.md`]: "added" });
});

test("fails rather than saying 'unchanged' when the baseline tag is missing", () => {
  const repo = repository({ tag: "none" });
  assert.throws(() => frameworkChanges(repo.root), (error) => error instanceof FrameworkChangesError && /was not found/.test(error.message));
});

test("fails when the baseline tag is not an annotated tag", () => {
  const repo = repository({ tag: "lightweight" });
  assert.throws(() => frameworkChanges(repo.root), /must be an annotated tag/);
});

test("fails when the Git history is shallow", () => {
  const repo = repository();
  repo.write("docs-site/more.txt", "more\n");
  repo.commit("More");
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), "framework-changes-shallow-"));
  execFileSync("git", ["clone", "-q", "--depth", "1", `file://${repo.root.replace(/\\/g, "/")}`, clone], { stdio: "ignore" });
  assert.throws(() => frameworkChanges(clone), /shallow/);
});

test("fails when the baseline tag is not part of the working draft's history", () => {
  const repo = repository({ tag: "none" });
  repo.git("checkout", "-q", "-b", "elsewhere");
  repo.write("docs-site/other.txt", "other\n");
  repo.commit("Other line of work");
  repo.git("tag", "-a", "published-1.0", "-m", "Tag on another branch");
  repo.git("checkout", "-q", "main");
  assert.throws(() => frameworkChanges(repo.root), /not part of the working draft's history/);
});

test("fails when the baseline file is missing or incomplete", () => {
  const repo = repository();
  repo.write("framework-baseline.json", JSON.stringify({ name: "published 1.0" }));
  assert.throws(() => readBaseline(repo.root), /"tag"/);
  fs.rmSync(path.join(repo.root, "framework-baseline.json"));
  assert.throws(() => readBaseline(repo.root), /Cannot read framework-baseline\.json/);
});

test("no 'last changed' date when only repository work has happened since the baseline", () => {
  const repo = repository();
  repo.write("docs-site/README.md", "Changed\n");
  repo.commit("Repository work", "2026-08-01");
  assert.equal(changes(repo).current.lastChanged, null);
});

test("the 'last changed' date ignores later repository-only and banner-only commits", () => {
  const repo = repository();
  repo.write(S12, framework(S12_TEXT.replace("test your controls", "test your controls regularly")));
  repo.commit("Change rule 12.1.b", "2026-07-01");
  repo.write("docs-site/README.md", "Website work\n");
  repo.commit("Repository work", "2026-08-01");
  repo.write(S12, framework(S12_TEXT.replace("test your controls", "test your controls regularly"), { bannerWording: "New banner." }));
  repo.commit("Banner only", "2026-09-01");
  assert.equal(changes(repo).current.lastChanged, "2026-07-01");
});

test("the 'last changed' date of a merged pull request is when it was merged into main", () => {
  const repo = repository();
  repo.git("checkout", "-q", "-b", "proposal");
  repo.write(S1, framework(S1_TEXT.replace("helps people", "helps everyone")));
  repo.commit("Change rule 1.1.a", "2026-07-01");
  repo.git("checkout", "-q", "main");
  execFileSync("git", ["merge", "-q", "--no-ff", "-m", "Merge the proposal", "proposal"], {
    cwd: repo.root,
    env: { ...process.env, GIT_AUTHOR_DATE: "2026-07-15T12:00:00Z", GIT_COMMITTER_DATE: "2026-07-15T12:00:00Z" },
    stdio: "ignore",
  });
  repo.write("docs-site/README.md", "Later website work\n");
  repo.commit("Repository work", "2026-08-01");
  assert.equal(changes(repo).current.lastChanged, "2026-07-15");
});

// Links, formatting and whitespace. A file has changed only if it looks
// different on the site; a link destination or formatting change counts.
const LINKED = [
  "## 1. Introduction",
  "",
  "1.1.a. Read the [data schema](https://www.gov.uk/old-schema) and [section 4](04-how.md#section-4) first.",
  "",
  "1.1.b. You must keep records.",
  "They must be kept safe.",
  "",
  "1.1.c. Use the `a b` setting.",
  "",
].join("\n");
// Addresses use SITE_URL, which the Reading site workflow sets to the repository's own Pages address.
const S1_URL = `${SITE_URL}trust-framework-1.0/part-1/`;

function changedTo(after) {
  const repo = repository({ s1: LINKED });
  repo.write(S1, framework(after));
  repo.commit("Change", "2026-07-01");
  return changes(repo);
}

test("a link-only change is listed, with the link's old and new destination", () => {
  const { unchanged, sections } = changedTo(LINKED.replace("old-schema", "new-schema"));
  assert.equal(unchanged, false);
  const [section] = sections;
  assert.equal(section.summary, "1 link changed.");
  const [item] = section.items;
  assert.equal(item.kind, "link");
  assert.equal(item.rule, "1.1.a");
  assert.equal(item.parts.some((part) => part.added || part.removed), false, "no words are marked");
  assert.deepEqual(item.links, [{ text: "data schema", from: "https://www.gov.uk/old-schema", to: "https://www.gov.uk/new-schema", image: false }]);
});

test("a relative link's destinations are shown as reading site addresses", () => {
  const [item] = changedTo(LINKED.replace("04-how.md#section-4", "05-rules.md#section-5")).sections[0].items;
  assert.deepEqual(item.links, [{ text: "section 4", from: `${S1_URL}04-how/#section-4`, to: `${S1_URL}05-rules/#section-5`, image: false }]);
});

test("a wording change and a link change in the same rule are both shown", () => {
  const [section] = changedTo(LINKED.replace("Read the [data schema](https://www.gov.uk/old-schema)", "Study the [data schema](https://www.gov.uk/new-schema)")).sections;
  assert.equal(section.summary, "1 rule changed, 1 link changed.");
  const [item] = section.items;
  assert.equal(item.kind, "changed");
  assert.deepEqual(item.parts.filter((part) => part.added || part.removed).map((part) => part.text), ["Read", "Study"]);
  assert.equal(item.links.length, 1);
});

test("formatting-only changes are listed as formatting, including whitespace that renders", () => {
  for (const [name, after] of [
    ["bold", LINKED.replace("You must keep", "You **must** keep")],
    ["hard line break", LINKED.replace("keep records.\n", "keep records.  \n")],
    ["spacing inside code", LINKED.replace("`a b`", "`a  b`")],
  ]) {
    const { unchanged, sections } = changedTo(after);
    assert.equal(unchanged, false, `${name} counts as a change`);
    assert.equal(sections[0].summary, "1 formatting change.", name);
    assert.equal(sections[0].items[0].kind, "formatting", name);
  }
});

test("whitespace that does not change how the text looks, and HTML comments, are not changes", () => {
  for (const [name, after] of [
    ["extra blank lines", LINKED.replace("\n\n1.1.b", "\n\n\n\n1.1.b")],
    ["double space in text", LINKED.replace("You must keep", "You must  keep")],
    ["whitespace-only line", LINKED.replace("\n\n1.1.c", "\n   \n1.1.c")],
    ["trailing space at the end of a paragraph", LINKED.replace("kept safe.", "kept safe. ")],
    ["HTML comment", `${LINKED}\n<!-- an editor's note -->\n`],
  ]) {
    const result = changedTo(after);
    assert.equal(result.unchanged, true, name);
    assert.equal(result.current.lastChanged, null, `${name} does not set a 'last changed' date`);
  }
});

test("a whitespace-only commit does not move the 'last changed' date", () => {
  const repo = repository({ s1: LINKED });
  repo.write(S1, framework(LINKED.replace("old-schema", "new-schema")));
  repo.commit("Change a link", "2026-07-01");
  repo.write(S1, framework(LINKED.replace("old-schema", "new-schema").replace("\n\n1.1.b", "\n\n\n1.1.b")));
  repo.commit("Whitespace only", "2026-08-01");
  assert.equal(changes(repo).current.lastChanged, "2026-07-01");
});

// The real repository: whatever the current state, what the site says must be
// consistent with the files under trust-framework-1.0/.
test("this repository: the result matches a direct comparison of the framework folder", () => {
  const result = frameworkChanges(REPO_ROOT);
  assertConsistent(result);
  const git = (...args) => execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
  const baseline = readBaseline(REPO_ROOT);
  const identical = git("rev-parse", `${baseline.tag}^{commit}:${FRAMEWORK_DIR}`) === git("rev-parse", `HEAD:${FRAMEWORK_DIR}`);
  if (identical) {
    assert.equal(result.unchanged, true, "identical framework folders must be reported as unchanged");
    assert.equal(result.current.lastChanged, null, "no 'last changed' date when nothing has changed");
  }
  const changedFiles = git("diff", "--name-only", `${baseline.tag}^{commit}`, "HEAD", "--", `${FRAMEWORK_DIR}/`).split("\n").filter(Boolean);
  for (const section of result.sections) assert.ok(changedFiles.includes(section.path), `${section.path} really changed`);
});
