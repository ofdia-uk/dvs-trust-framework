// Why a change to the trust framework was made, where maintainers have
// chosen to say so.
//
// The "What's changed" pages (lib/changes.js) show what differs between the
// baseline and the working draft. This adds, next to a change, the issues
// that raised it, the pull requests that accepted it and a short explanation,
// but only where a maintainer has recorded them in change-provenance.json at
// the repository root, which is changed only by a reviewed pull request.
// Nothing is worked out from commit messages, pull requests or discussion on
// GitHub, and a change with no entry shows nothing.
//
// Each entry in "changes" explains one accepted change:
//
// - id: c followed by at least four digits, such as c0001, so the entry can
//   be corrected or removed by name.
// - baseline: the baseline tag the change was made against, such as
//   published-1.0. Only entries for the current baseline (framework-
//   baseline.json) are shown. When the baseline moves on, older entries stay
//   as a record but are no longer shown.
// - rules: the permanent identities of the rules it changed (r0254), never
//   their numbers, so the entry follows a rule that is renumbered or moved.
//   A removed (retired) rule can be listed, to explain its removal.
// - sections: section files whose change it explains as a whole, for
//   changes that are not to a numbered rule, such as a heading or a table.
// - issues, pullRequests: the numbers of the issues and pull requests on
//   GitHub. The site links to them and shows nothing else from them.
// - rationale: an optional short explanation, written and approved by a
//   maintainer, shown exactly as written.
//
// When the file is wrong or out of date, for example it explains a rule that
// has not changed since the baseline, checkChangeProvenance says what to
// change and the build stops, so nothing wrong is published.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPOSITORY_URL } from "./markdown.js";
import { readBaseline } from "./changes.js";

export const PROVENANCE_FILE = "change-provenance.json";
export const GUIDANCE = "ARCHITECTURE.md, under Why a change was made";
export const MAX_RATIONALE = 400;

const CHANGE_ID = /^c\d{4,}$/;
const RULE_ID = /^r\d{4,}$/;
const NUMBER = /^\d+(?:\.\d+)+(?:\.[a-z]+)+$/;
const FILE = /^trust-framework-1\.0\/(?:[^/]+\/)*[^/]+\.md$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const GITHUB_LINK = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)\/?$/;
const TOP_LEVEL_KEYS = ["about", "changes"];
const ENTRY_KEYS = ["id", "baseline", "rules", "sections", "issues", "pullRequests", "rationale"];
const REFERENCE_KEYS = { issues: "issue", pullRequests: "pull request" };

export class ChangeProvenanceError extends Error {
  constructor(problems) {
    super(
      `${PROVENANCE_FILE} does not match the changes to the trust framework (${problems.length} problem${problems.length === 1 ? "" : "s"}). ` +
        `See ${GUIDANCE}.\n\n${problems.join("\n\n")}`,
    );
    this.problems = problems;
  }
}

/** The address of an issue or pull request on GitHub. */
export const issueUrl = (number, repositoryUrl = REPOSITORY_URL) => `${repositoryUrl}/issues/${number}`;
export const pullRequestUrl = (number, repositoryUrl = REPOSITORY_URL) => `${repositoryUrl}/pull/${number}`;

/** The register, as stored. Throws a ChangeProvenanceError if it cannot be read. */
export function readChangeProvenance(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, PROVENANCE_FILE), "utf-8"));
  } catch (error) {
    throw new ChangeProvenanceError([`${PROVENANCE_FILE} cannot be read: ${error.message}`]);
  }
}

/**
 * Whether a tag exists in the repository at `root`: true, false, or null if
 * that cannot be found out (for example, there is no Git repository).
 */
export function tagExists(root, tag) {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], { cwd: root, stdio: "ignore" });
  } catch {
    return null;
  }
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Whether an explanation is plain text on one line. */
const plainText = (text) => typeof text === "string" && text.trim() !== "" && !/[\u0000-\u001f\u007f]/.test(text);

const sectionNumberOf = (file) => {
  const match = /^(\d\d)-/.exec(path.posix.basename(file));
  return match ? `section ${Number(match[1])}` : file;
};

/**
 * Every place each rule has had: "file\nnumber" → the identities that have
 * been there, now or in their history.
 */
function placesOf(identities) {
  const places = new Map();
  const add = (file, number, id) => {
    const key = `${file}\n${number}`;
    if (!places.has(key)) places.set(key, new Set());
    places.get(key).add(id);
  };
  for (const identity of identities.list) {
    for (const place of identity.history) add(place.file, place.number, identity.id);
    if (identity.status === "current") add(identity.repoPath, identity.number, identity.id);
  }
  return places;
}

/**
 * The rules a block on a "What's changed" page is about, as identities:
 *
 * - its rule now: the rule that has the block's number in the section now;
 * - its rule in the baseline: the one rule that has ever had the old block's
 *   number in the section's old file. If more than one has (a reused number),
 *   it cannot be told which, so none is given.
 *
 * Nothing is matched by wording, and a rule is never guessed.
 */
export function blockIdentities(section, item, identities, places = placesOf(identities)) {
  const ids = [];
  if (item.kind !== "removed" && item.rule) {
    const id = identities.byNumber[item.rule];
    if (id && identities.byId[id].repoPath === section.path) ids.push(id);
  }
  if (item.oldRule) {
    const holders = places.get(`${section.oldPath ?? section.path}\n${item.oldRule}`);
    if (holders?.size === 1) {
      const [id] = holders;
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/** The rules and section files that the "What's changed" pages show as changed. */
function changedTargets(changes, identities) {
  const places = placesOf(identities);
  const rules = new Set();
  const sections = new Map();
  for (const section of changes.sections) {
    sections.set(section.path, section);
    if (section.oldPath) sections.set(section.oldPath, section);
    for (const item of section.items) for (const id of blockIdentities(section, item, identities, places)) rules.add(id);
  }
  return { rules, sections };
}

/** What is wrong with an "issues" or "pullRequests" item, or "" if nothing. */
function referenceProblem(value, noun) {
  if (Number.isInteger(value) && value > 0) return "";
  const text = typeof value === "string" ? value.trim() : "";
  const number = /^#?(\d+)$/.exec(text)?.[1] ?? GITHUB_LINK.exec(text)?.[1];
  if (number) return `${JSON.stringify(value)} must be written as the ${noun}'s number alone, without quotes, "#" or an address: ${Number(number)}.`;
  return `${JSON.stringify(value)} is not the number of ${noun === "issue" ? "an" : "a"} ${noun} on GitHub, such as 123.`;
}

/**
 * Problems with the register, as messages that say what to do. Empty if every
 * entry is valid and explains a change the "What's changed" pages show.
 *
 * - identities: resolveIdentities(...) from lib/rule-identities.js.
 * - changes: frameworkChanges(...) from lib/changes.js, or null if the
 *   working draft could not be compared with its baseline. Then only the
 *   register itself is checked, not whether its changes really happened.
 * - baseline: the current baseline's tag, from framework-baseline.json.
 * - tagExists: tag → true, false or null (unknown), for older baselines.
 */
export function checkChangeProvenance(register, { identities, changes = null, baseline = null, tagExists = () => null }) {
  if (!register || typeof register !== "object" || Array.isArray(register) || !Array.isArray(register.changes)) {
    return [`${PROVENANCE_FILE} must be an object with a "changes" list.`];
  }
  const problems = [];
  for (const key of Object.keys(register)) {
    if (!TOP_LEVEL_KEYS.includes(key)) problems.push(`${PROVENANCE_FILE} has an unexpected field "${key}".`);
  }
  const changed = changes ? changedTargets(changes, identities) : null;
  const seenIds = new Map();
  const checkedTags = new Map();
  // Which entry first used each number as an issue or as a pull request.
  const numbersAs = { issues: new Map(), pullRequests: new Map() };
  // "target\nreference" → the entry that explains it, for finding conflicts.
  const explained = new Map();

  register.changes.forEach((entry, i) => {
    const where = `Entry ${i + 1} in "changes"`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${where} is not an object.`);
      return;
    }
    const name = typeof entry.id === "string" && CHANGE_ID.test(entry.id) ? `${where} (${entry.id})` : where;
    const bad = (message) => problems.push(`${name}: ${message}`);
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.includes(key)) bad(`unexpected field "${key}".`);

    if (typeof entry.id !== "string" || !CHANGE_ID.test(entry.id)) {
      bad(`its "id" must be c followed by at least four digits, such as "c0001", not ${JSON.stringify(entry.id)}. npm run provenance -- record gives a new entry the next one.`);
    } else if (seenIds.has(entry.id)) {
      bad(`the id ${entry.id} is already used by entry ${seenIds.get(entry.id)}. Give each entry its own id.`);
    } else {
      seenIds.set(entry.id, i + 1);
    }

    // The baseline: the current one is checked against the changes; an older
    // one is kept as a record and must at least exist.
    let current = false;
    if (typeof entry.baseline !== "string" || !TAG.test(entry.baseline)) {
      bad(`its "baseline" must be the tag the change was made against, such as ${JSON.stringify(baseline ?? "published-1.0")}${baseline ? ", the current baseline in framework-baseline.json" : ""}.`);
    } else if (entry.baseline === baseline) {
      current = true;
    } else {
      if (!checkedTags.has(entry.baseline)) checkedTags.set(entry.baseline, tagExists(entry.baseline));
      if (checkedTags.get(entry.baseline) === false) {
        bad(`its "baseline" is ${entry.baseline}, but there is no such tag. Entries for the current baseline give ${JSON.stringify(baseline)}. An entry for an earlier baseline is kept as a record and not shown, and must name a tag that exists.`);
      }
    }

    if (entry.rules === undefined && entry.sections === undefined) {
      bad(`it must say what changed: list the rules' permanent identities in "rules", or section files in "sections", or both.`);
    }
    if (entry.issues === undefined && entry.pullRequests === undefined && entry.rationale === undefined) {
      bad(`it must say why: give the "issues" that raised the change, the "pullRequests" that accepted it, a short "rationale", or any of these.`);
    }
    const lists = {};
    for (const key of ["rules", "sections", "issues", "pullRequests"]) {
      const list = entry[key];
      if (list === undefined) continue;
      if (!Array.isArray(list) || !list.length) {
        bad(`"${key}" must be a list with at least one item, or left out.`);
        continue;
      }
      if (new Set(list).size !== list.length) bad(`"${key}" lists the same item more than once.`);
      lists[key] = list;
    }

    for (const key of ["issues", "pullRequests"]) {
      for (const value of lists[key] ?? []) {
        const problem = referenceProblem(value, REFERENCE_KEYS[key]);
        if (problem) {
          bad(`in "${key}", ${problem}`);
          continue;
        }
        const other = key === "issues" ? "pullRequests" : "issues";
        const clash = numbersAs[other].get(value);
        if (clash) {
          bad(
            `#${value} is listed as ${key === "issues" ? "an issue" : "a pull request"} here, but as ${key === "issues" ? "a pull request" : "an issue"} in ${clash}. ` +
              `Issues and pull requests share numbers on GitHub, so #${value} is one or the other: check it and correct the wrong one.`,
          );
        } else if (!numbersAs[key].has(value)) {
          numbersAs[key].set(value, name === where ? `entry ${i + 1}` : entry.id);
        }
      }
    }

    if (entry.rationale !== undefined) {
      if (!plainText(entry.rationale)) {
        bad(`its "rationale" must be a short explanation on one line, as plain text, such as "Makes clear that the requirement covers data in transit."`);
      } else if (entry.rationale.length > MAX_RATIONALE) {
        bad(`its "rationale" is ${entry.rationale.length} characters long. Keep it to ${MAX_RATIONALE} or fewer: link to the issue or pull request for the full discussion.`);
      }
    }

    const targets = [];
    for (const id of lists.rules ?? []) {
      if (typeof id === "string" && NUMBER.test(id)) {
        const holder = identities.byNumber[id];
        bad(
          `"rules" must give permanent identities, not rule numbers, so the entry stays with the rule if it is renumbered or moved. ` +
            (holder ? `Rule ${id} is ${holder}: use "${holder}".` : `No rule in the working draft has the number ${id}. A removed rule's identity is on its permanent page.`),
        );
        continue;
      }
      if (typeof id !== "string" || !RULE_ID.test(id)) {
        bad(`${JSON.stringify(id)} in "rules" is not a permanent identity, such as r0254.`);
        continue;
      }
      const identity = identities.byId[id];
      if (!identity) {
        bad(`${id} is not in rule-identities.json. Check the identity on the rule's permanent link (Copy link gives /rules/<identity>/).`);
        continue;
      }
      const label = identity.status === "retired" ? `${id} (rule ${identity.number} when it was removed)` : `${id} (rule ${identity.number})`;
      if (current && changed && !changed.rules.has(id)) {
        const movedFile = identity.status === "current" && changed.sections.get(identity.repoPath)?.status === "moved";
        bad(
          movedFile
            ? `${label} has not changed since ${baseline}: only its section file has moved. To explain the move, list ${JSON.stringify(identity.repoPath)} in "sections" instead.`
            : `the "What's changed" pages show no change to ${label} since ${baseline}, so there is no change to explain. ` +
                `Check the identity. If the change has been undone, remove ${id} from this entry, or remove the entry. ` +
                `If the change is shown under a number that more than one rule has had, the site cannot tell which rule it was: list its section file in "sections" instead.`,
        );
        continue;
      }
      targets.push({ key: `rule ${id}`, label: `rule ${label}` });
    }
    for (const file of lists.sections ?? []) {
      if (typeof file !== "string" || !FILE.test(file)) {
        bad(`${JSON.stringify(file)} in "sections" is not a file of the trust framework, such as "trust-framework-1.0/part-3/12-service-requirements.md".`);
        continue;
      }
      if (current && changed && !changed.sections.has(file)) {
        bad(`${file} has not changed since ${baseline}, so there is no change to explain. If it has been renamed, give its new file. If the change has been undone, remove it from this entry, or remove the entry.`);
        continue;
      }
      targets.push({ key: `section ${file}`, label: sectionNumberOf(file) });
    }

    // Each pull request's change to a rule or section is explained once. An
    // entry with no pull request is matched by its issues instead.
    if (!current) return;
    const references = (lists.pullRequests ?? []).length
      ? lists.pullRequests.map((number) => `pull request #${number}`)
      : (lists.issues ?? []).length
        ? lists.issues.map((number) => `issue #${number}`)
        : ["an explanation with no issue or pull request"];
    for (const target of targets) {
      for (const reference of references) {
        const key = `${target.key}\n${reference}`;
        const first = explained.get(key);
        if (first && first !== name) {
          bad(`${target.label} is already explained by ${reference} in ${first}. Explain each change once: combine the two entries, or remove ${target.label.replace(/^rule /, "")} from one of them.`);
        } else {
          explained.set(key, name);
        }
      }
    }
  });
  return problems;
}

/** An entry with its fields in the register's order. */
export function canonicalEntry(entry) {
  return Object.fromEntries(ENTRY_KEYS.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]));
}

/** The register as it is written: one entry per line, so changes are easy to review. */
export function formatChangeProvenance(register) {
  const lines = ["{"];
  if (register.about !== undefined) lines.push(`  "about": ${JSON.stringify(register.about)},`);
  const entries = register.changes.map((entry) => `    ${JSON.stringify(canonicalEntry(entry))}`);
  lines.push(entries.length ? `  "changes": [\n${entries.join(",\n")}\n  ]` : `  "changes": []`);
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/** The next entry id after every one in the register. */
export function nextChangeId(register) {
  const numbers = (register.changes ?? []).map((entry) => entry?.id).filter((id) => typeof id === "string" && CHANGE_ID.test(id)).map((id) => Number(id.slice(1)));
  return `c${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}`;
}

/**
 * The explanations for the "What's changed" pages. The register must have
 * passed checkChangeProvenance. Only entries for the current baseline are
 * shown.
 *
 * Returns {
 *   count: the number of entries shown;
 *   bySection: changed file (its path now) → {
 *     count: the number of entries shown on its page;
 *     section: the entries that explain the section as a whole;
 *     items: for each of its changed blocks, in the same order, the entries
 *       that explain a rule the block is about.
 *   }
 * }
 *
 * Each entry is { id, rationale, issues, pullRequests }, where issues and
 * pullRequests are [{ number, url }]. Entries are in the register's order,
 * so the oldest comes first. A section or block with none has an empty list.
 */
export function resolveChangeProvenance(register, identities, changes, baseline, repositoryUrl = REPOSITORY_URL) {
  const shown = register.changes.filter((entry) => entry.baseline === baseline);
  const bySection = {};
  if (!changes?.sections) return { count: 0, bySection };
  const views = shown.map((entry) => ({
    entry,
    view: {
      id: entry.id,
      rationale: entry.rationale?.trim() || null,
      issues: (entry.issues ?? []).map((number) => ({ number, url: issueUrl(number, repositoryUrl) })),
      pullRequests: (entry.pullRequests ?? []).map((number) => ({ number, url: pullRequestUrl(number, repositoryUrl) })),
    },
  }));
  const places = placesOf(identities);
  const used = new Set();
  for (const section of changes.sections) {
    const files = [section.path, section.oldPath].filter(Boolean);
    const forSection = views.filter(({ entry }) => (entry.sections ?? []).some((file) => files.includes(file)));
    const items = section.items.map((item) => {
      const ids = blockIdentities(section, item, identities, places);
      return views.filter(({ entry }) => (entry.rules ?? []).some((id) => ids.includes(id)));
    });
    const onPage = new Set([...forSection, ...items.flat()].map(({ entry }) => entry.id));
    for (const id of onPage) used.add(id);
    bySection[section.path] = { count: onPage.size, section: forSection.map(({ view }) => view), items: items.map((list) => list.map(({ view }) => view)) };
  }
  return { count: used.size, bySection };
}

/**
 * The explanations for the site: reads the register, checks it against the
 * rule identities and the changes since the baseline, and resolves it.
 * Throws a ChangeProvenanceError, which stops the build, if they do not
 * agree. `changes` is the site's frameworkChanges data; if it is not
 * available (a local build without the Git history), only the register
 * itself is checked and nothing is shown.
 */
export function loadChangeProvenance(root, identities, changes) {
  const register = readChangeProvenance(root);
  let baseline = null;
  try {
    baseline = readBaseline(root).tag;
  } catch {
    // Without a baseline there are no changes to explain; the entries are still checked.
  }
  const available = changes && changes.available !== false ? changes : null;
  const problems = checkChangeProvenance(register, { identities, changes: available, baseline, tagExists: (tag) => tagExists(root, tag) });
  if (problems.length) throw new ChangeProvenanceError(problems);
  return resolveChangeProvenance(register, identities, available, baseline);
}
