#!/usr/bin/env node
// Check and change change-provenance.json, which says why changes to the
// trust framework were made, where maintainers have chosen to show that on
// the reading site's "What's changed" pages. See ARCHITECTURE.md, under Why a
// change was made.
//
//   npm run provenance                                  check the register
//   npm run provenance -- record --rules 12.4.1.c --issues 123 --pr 147 --rationale "Makes clear …"
//                                                       record why a change was made
//   npm run provenance -- record c0003 --rationale "…"  correct entry c0003 (replaces only what is given)
//   npm run provenance -- remove c0003                  stop showing entry c0003
//
// Rules can be given by their current number (12.4.1.c), by the number a
// removed rule last had, or by their permanent identity (r0254); either way
// the register records the identity, so the entry stays with the rule if it
// is renumbered or moved. Sections can be given by number (12) or by file.
// Issues and pull requests can be given as 123, #123 or their address on
// GitHub. A new entry is recorded against the current baseline
// (framework-baseline.json).
//
// Nothing here decides why a change was made, or reads anything from GitHub.
// Each command does only what it is told, and refuses anything that would
// leave the register wrong.
//
// Exit status:
//   0  the register is in order (after the change, if any);
//   1  the register has problems (the output says what to change);
//   2  nothing was done: the command was refused, or the register, the rule
//      identities or the changes since the baseline could not be read.
//      change-provenance.json is unchanged.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuleIdentities, sectionFiles, RuleIdentityError } from "../lib/rule-identities.js";
import { frameworkChanges, readBaseline, FrameworkChangesError } from "../lib/changes.js";
import { REPOSITORY_URL } from "../lib/markdown.js";
import {
  PROVENANCE_FILE,
  ChangeProvenanceError,
  readChangeProvenance,
  checkChangeProvenance,
  formatChangeProvenance,
  nextChangeId,
  tagExists,
} from "../lib/change-provenance.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RULE_ID = /^r\d{4,}$/;
const CHANGE_ID = /^c\d{4,}$/;
const NUMBER = /^\d+(?:\.\d+)+(?:\.[a-z]+)+$/;
const SECTION_NUMBER = /^\d{1,2}$/;
const OPTIONS = { "--rules": "rules", "--sections": "sections", "--issues": "issues", "--pr": "pullRequests", "--pull-requests": "pullRequests", "--rationale": "rationale" };

export const REFUSED = 2;

export class UsageError extends Error {}

/** "Rule 12.4.1.C." becomes "12.4.1.c"; "R0254" becomes "r0254". */
const tidy = (text) => String(text).trim().toLowerCase().replace(/^(rule|section)\s*/, "").replace(/\.$/, "");

/**
 * The permanent identity of a rule given by its number now, the number a
 * removed rule last had, or its identity.
 */
function ruleIdentity(identities, given) {
  const key = tidy(given);
  if (RULE_ID.test(key)) {
    if (!identities.byId[key]) throw new UsageError(`${given} is not in rule-identities.json.`);
    return key;
  }
  if (NUMBER.test(key)) {
    if (identities.byNumber[key]) return identities.byNumber[key];
    const former = identities.formerHolders[key] ?? [];
    if (former.length === 1) return former[0].id;
    if (former.length > 1) {
      throw new UsageError(`No rule has the number ${key} now, and more than one rule has had it (${former.map((holder) => holder.id).join(", ")}). Give the identity of the one you mean.`);
    }
    throw new UsageError(`No rule in the working draft has the number ${key}, and no removed rule had it.`);
  }
  throw new UsageError(`"${given}" is not a rule number, such as 12.4.1.c, or a permanent identity, such as r0254.`);
}

/** The file of a section given by number (12) or file. */
function sectionFile(sectionPaths, given) {
  if (sectionPaths.includes(given) || /^trust-framework-1\.0\/.+\.md$/.test(given)) return given;
  const key = tidy(given);
  if (SECTION_NUMBER.test(key)) {
    const file = sectionPaths.find((repoPath) => path.posix.basename(repoPath).startsWith(`${key.padStart(2, "0")}-`));
    if (file) return file;
  }
  throw new UsageError(`"${given}" is not a section of the trust framework. Give its number, such as 12, or its file, such as trust-framework-1.0/part-3/12-service-requirements.md.`);
}

/**
 * The number of an issue or pull request given as 123, #123 or its address
 * in this repository. `kind` is "issues" or "pullRequests".
 */
export function referenceNumber(text, kind, repositoryUrl = REPOSITORY_URL) {
  const noun = kind === "issues" ? "issue" : "pull request";
  const value = String(text ?? "").trim();
  let match = /^#?(\d+)$/.exec(value);
  if (!match) {
    const link = /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/(issues|pull)\/(\d+)\/?(?:[?#].*)?$/i.exec(value);
    if (link && link[1].toLowerCase() !== repositoryUrl.toLowerCase()) {
      throw new UsageError(`${value} is in another repository. Give a ${noun} in ${repositoryUrl}.`);
    }
    if (link && (link[2].toLowerCase() === "issues") !== (kind === "issues")) {
      throw new UsageError(`${value} is ${link[2].toLowerCase() === "issues" ? "an issue" : "a pull request"}. Give it with ${link[2].toLowerCase() === "issues" ? "--issues" : "--pr"}.`);
    }
    match = link ? [value, link[3]] : null;
  }
  const number = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(number) || number < 1) throw new UsageError(`Give the ${noun}'s number on GitHub, such as 123, not ${JSON.stringify(text ?? "")}.`);
  return number;
}

/** Split `record [c0003] --rules … --issues … --pr … --rationale …` into its parts. */
function parseRecord(args) {
  const [first, ...rest] = args;
  const id = first && !first.startsWith("--") ? first.trim().toLowerCase() : null;
  const options = {};
  let current = null;
  for (const arg of id ? rest : args) {
    if (OPTIONS[arg]) {
      current = OPTIONS[arg];
      if (options[current]) throw new UsageError(`${arg} is given more than once.`);
      options[current] = [];
    } else if (!current) {
      throw new UsageError(`Unexpected "${arg}". Use --rules, --sections, --issues, --pr and --rationale, for example: record --rules 12.4.1.c --issues 123 --pr 147`);
    } else {
      options[current].push(arg);
    }
  }
  if (id !== null && !CHANGE_ID.test(id)) throw new UsageError(`"${first}" is not an entry, such as c0003. To record a new entry, start with an option such as --rules.`);
  if (options.rationale && options.rationale.length !== 1) throw new UsageError(`--rationale takes one value. Put the explanation in quotes.`);
  for (const key of ["rules", "sections", "issues", "pullRequests"]) {
    if (options[key] && !options[key].length) throw new UsageError(`--${key === "pullRequests" ? "pr" : key} needs at least one value.`);
  }
  if (!Object.keys(options).length) throw new UsageError(`Say what to record, for example: record --rules 12.4.1.c --issues 123 --pr 147 --rationale "Makes clear …"`);
  return { id, ...options, rationale: options.rationale?.[0] };
}

/**
 * Apply a command to the register. `context` is { identities, sectionPaths,
 * baseline, check }, where check(register) returns its problems. Returns a
 * list of what it did. Throws a UsageError, and leaves the register as it
 * was, if it cannot.
 */
export function apply(register, context, command, args) {
  const { identities, sectionPaths, baseline, check } = context;
  const done = [];
  switch (command) {
    case "record": {
      const given = parseRecord(args);
      const existing = given.id ? register.changes.find((entry) => entry.id === given.id) : null;
      if (given.id && !existing) throw new UsageError(`${given.id} is not in ${PROVENANCE_FILE}. To record a new entry, leave out the id.`);
      if (!existing && !baseline) throw new UsageError(`The current baseline cannot be read from framework-baseline.json.`);
      const entry = existing ? { ...existing } : { id: nextChangeId(register), baseline };
      if (given.rules) entry.rules = [...new Set(given.rules.map((rule) => ruleIdentity(identities, rule)))];
      if (given.sections) entry.sections = [...new Set(given.sections.map((section) => sectionFile(sectionPaths, section)))];
      if (given.issues) entry.issues = [...new Set(given.issues.map((issue) => referenceNumber(issue, "issues")))];
      if (given.pullRequests) entry.pullRequests = [...new Set(given.pullRequests.map((pr) => referenceNumber(pr, "pullRequests")))];
      if (given.rationale !== undefined) {
        if (given.rationale.trim()) entry.rationale = given.rationale.trim();
        else delete entry.rationale;
      }
      const after = { ...register, changes: existing ? register.changes.map((each) => (each === existing ? entry : each)) : [...register.changes, entry] };
      const problems = check(after);
      if (problems.length) throw new UsageError(problems.join("\n\n"));
      register.changes = after.changes;
      const about = [
        ...(entry.rules ?? []).map((id) => `rule ${identities.byId[id].number} (${id})`),
        ...(entry.sections ?? []).map((file) => file),
      ];
      const why = [
        ...(entry.issues ?? []).map((n) => `issue #${n}`),
        ...(entry.pullRequests ?? []).map((n) => `pull request #${n}`),
        ...(entry.rationale ? [`"${entry.rationale}"`] : []),
      ];
      done.push(`${existing ? "Updated" : "Recorded"} ${entry.id}: the change to ${about.join(", ")} since ${entry.baseline}, explained by ${why.join(", ")}.`);
      break;
    }
    case "remove": {
      if (args.length !== 1) throw new UsageError("Give one entry, for example: remove c0003");
      const id = args[0].trim().toLowerCase();
      if (!register.changes.some((entry) => entry.id === id)) throw new UsageError(`${args[0]} is not in ${PROVENANCE_FILE}, so there is nothing to remove.`);
      register.changes = register.changes.filter((entry) => entry.id !== id);
      done.push(`Removed ${id}. The site will stop showing it; the issues and pull requests on GitHub are unchanged.`);
      break;
    }
    default:
      throw new UsageError(`Unknown command "${command}". Use check, record or remove.`);
  }
  return done;
}

function main(argv) {
  const [command = "check", ...args] = argv;
  let identities;
  try {
    identities = loadRuleIdentities(ROOT);
  } catch (error) {
    if (!(error instanceof RuleIdentityError)) throw error;
    console.error(`${PROVENANCE_FILE} cannot be checked or changed until rule-identities.json matches the trust framework. Run npm run rules.`);
    return REFUSED;
  }
  let register;
  try {
    register = readChangeProvenance(ROOT);
  } catch (error) {
    if (!(error instanceof ChangeProvenanceError)) throw error;
    console.error(error.message);
    return REFUSED;
  }
  let changes;
  let baseline;
  try {
    baseline = readBaseline(ROOT).tag;
    changes = frameworkChanges(ROOT);
  } catch (error) {
    if (!(error instanceof FrameworkChangesError)) throw error;
    console.error(`${PROVENANCE_FILE} cannot be checked, because the working draft cannot be compared with its baseline.\n\n${error.message}`);
    return REFUSED;
  }
  const check = (each) => checkChangeProvenance(each, { identities, changes, baseline, tagExists: (tag) => tagExists(ROOT, tag) });
  if (command !== "check") {
    try {
      const context = { identities, sectionPaths: sectionFiles(ROOT), baseline, check };
      for (const line of apply(register, context, command, args)) console.log(line);
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      console.error(`Nothing was changed.\n\n${error.message}`);
      return REFUSED;
    }
    fs.writeFileSync(path.join(ROOT, PROVENANCE_FILE), formatChangeProvenance(register));
    console.log(`Updated ${PROVENANCE_FILE}. Review the change before committing it.\n`);
  }
  const problems = check(register);
  if (problems.length) {
    console.error(new ChangeProvenanceError(problems).message);
    return 1;
  }
  const shown = register.changes.filter((entry) => entry.baseline === baseline).length;
  const kept = register.changes.length - shown;
  console.log(
    `${PROVENANCE_FILE} is in order: ${shown} change${shown === 1 ? "" : "s"} explained on the reading site` +
      (kept ? `, and ${kept} entr${kept === 1 ? "y" : "ies"} for earlier baselines kept as a record.` : "."),
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.stack ?? String(error));
    process.exitCode = REFUSED;
  }
}
