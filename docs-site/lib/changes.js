// Changes to the trust framework since its baseline.
//
// The baseline is the annotated Git tag named in framework-baseline.json at
// the repository root, initially published-1.0. Changing that file is a
// deliberate, reviewed decision. Repository-only work never needs a tag.
//
// Only the framework content counts: the files under trust-framework-1.0/.
// Their repository-only parts (the caution banner and the "Repository
// navigation" footer) are removed before comparing, the same way the site
// removes them, so updating those is not a change to the trust framework.
// Changes anywhere else in the repository are ignored.
//
// A file has changed only if it looks different on the site: it is rendered
// as the site renders it, and whitespace that a browser does not show (runs
// of spaces and line breaks in ordinary text) and HTML comments are ignored.
// Whitespace that matters, such as a hard line break or anything inside
// code, still counts. A changed link destination or formatting counts too.
//
// The comparison is between the baseline and the committed working draft
// (HEAD). It needs the tag and the full Git history. If either is missing it
// throws, so the site can never wrongly say the wording is unchanged.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import markdownIt from "markdown-it";
import { diffArrays, diffWords } from "diff";
import { markdownLibrary, stripRepositoryFurniture, firstHeading, siteUrlFor, siteLinkFor, RULE_NUMBER, ruleAnchor } from "./markdown.js";
import { siteAddress } from "./feedback.js";

export const FRAMEWORK_DIR = "trust-framework-1.0";
export const BASELINE_FILE = "framework-baseline.json";

export class FrameworkChangesError extends Error {}

/** The configured baseline: { tag, name, description?, url? }. */
export function readBaseline(root) {
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(path.join(root, BASELINE_FILE), "utf-8"));
  } catch (error) {
    throw new FrameworkChangesError(`Cannot read ${BASELINE_FILE}: ${error.message}`);
  }
  for (const key of ["tag", "name"]) {
    if (typeof baseline?.[key] !== "string" || !baseline[key].trim()) {
      throw new FrameworkChangesError(`${BASELINE_FILE} must give the baseline's "${key}".`);
    }
  }
  return baseline;
}

/** Framework Markdown with the repository-only parts removed. */
export function frameworkText(source) {
  return stripRepositoryFurniture(source.replace(/\r\n?/g, "\n")).trim();
}

/**
 * Rendered HTML with the differences a reader cannot see removed: HTML
 * comments, and runs of whitespace in ordinary text, which a browser shows
 * as one space. Whitespace inside <pre> and <code> is kept exactly.
 */
export function renderedSignature(html) {
  return html
    .split(/(<pre\b[\s\S]*?<\/pre>|<code\b[\s\S]*?<\/code>)/)
    .map((part, i) => (i % 2 ? part : part.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ")))
    .join("")
    .trim();
}

/** How a framework file looks on the site, for deciding whether it changed. */
export function renderedFramework(source, repoPath) {
  return renderedSignature(markdownLibrary.render(frameworkText(source), { page: { inputPath: `../${repoPath}` } }));
}

// Renders a single block on its own, for matching blocks and finding links.
const blockRenderer = markdownIt({ html: true, linkify: false, typographer: false });
const blockSignature = (block) => renderedSignature(blockRenderer.render(block));

/**
 * The changes to the framework content between the baseline and HEAD.
 *
 * Returns { baseline, current, unchanged, sections }. current.lastChanged is
 * the date the framework content last changed on main, or null if it has not
 * changed since the baseline. Each changed section
 * (one per changed file) has its path, status (added, removed, changed or
 * moved), title, site address, a short summary and the changed blocks. Each
 * block has its kind, its rule number now (rule) and in the baseline
 * (oldRule), and what changed.
 */
export function frameworkChanges(root) {
  const baseline = readBaseline(root);
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf-8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const gitOk = (...args) => {
    try {
      git(...args);
      return true;
    } catch {
      return false;
    }
  };

  if (git("rev-parse", "--is-shallow-repository").trim() === "true") {
    throw new FrameworkChangesError(
      "The Git history is incomplete (a shallow clone), so the trust framework cannot be compared with its baseline. Fetch the full history and tags, for example with fetch-depth: 0.",
    );
  }
  const tagRef = `refs/tags/${baseline.tag}`;
  if (!gitOk("rev-parse", "--verify", "--quiet", tagRef)) {
    throw new FrameworkChangesError(`The baseline tag ${baseline.tag} (from ${BASELINE_FILE}) was not found. Fetch the repository's tags.`);
  }
  if (git("cat-file", "-t", tagRef).trim() !== "tag") {
    throw new FrameworkChangesError(`The baseline tag ${baseline.tag} must be an annotated tag.`);
  }
  const baseCommit = git("rev-parse", `${tagRef}^{commit}`).trim();
  const head = git("rev-parse", "HEAD").trim();
  if (!gitOk("merge-base", "--is-ancestor", baseCommit, head)) {
    throw new FrameworkChangesError(`The baseline tag ${baseline.tag} is not part of the working draft's history.`);
  }
  if (!gitOk("rev-parse", "--verify", "--quiet", `${head}:${FRAMEWORK_DIR}`)) {
    throw new FrameworkChangesError(`The working draft has no ${FRAMEWORK_DIR}/ folder.`);
  }

  const tree = (commit) => (gitOk("rev-parse", "--verify", "--quiet", `${commit}:${FRAMEWORK_DIR}`) ? git("rev-parse", `${commit}:${FRAMEWORK_DIR}`).trim() : null);
  // cat-file rather than show: show also checks "commit:file" as a file name,
  // which fails on Windows when the path is long.
  const show = (commit, file) => git("cat-file", "blob", `${commit}:${file}`);
  // Both versions of a file are compared as if at the same path, so that a
  // moved file's links and anchors are resolved the same way.
  const comparable = (file, text) => (file.endsWith(".md") ? renderedFramework(text, file) : text);

  /**
   * The framework files that really differ between two commits: not only in
   * their caution banner or footer. Git's own rename detection is not used,
   * because the banner and footer make small files look similar. A file
   * counts as moved only when a removed file and an added file look exactly
   * the same.
   */
  const fileChanges = (from, to) => {
    if (tree(from) === tree(to)) return [];
    const entries = [];
    const fields = git("diff", "--name-status", "--no-renames", "-z", from, to, "--", `${FRAMEWORK_DIR}/`).split("\0").filter(Boolean);
    for (let i = 0; i < fields.length; i += 2) {
      const [code, file] = [fields[i], fields[i + 1]];
      entries.push({
        oldPath: code === "A" ? null : file,
        newPath: code === "D" ? null : file,
        oldText: code === "A" ? null : show(from, file),
        newText: code === "D" ? null : show(to, file),
        renamed: false,
      });
    }
    for (const added of entries.filter((entry) => !entry.oldPath)) {
      const removed = entries.find(
        (entry) => !entry.newPath && !entry.pairedWith && comparable(added.newPath, entry.oldText) === comparable(added.newPath, added.newText),
      );
      if (removed) {
        Object.assign(added, { oldPath: removed.oldPath, oldText: removed.oldText, renamed: true });
        removed.pairedWith = added; // shown as part of the file it moved to
      }
    }
    return entries
      .filter((entry) => !entry.pairedWith)
      .map((entry) => ({
        ...entry,
        same: entry.oldText !== null && entry.newText !== null && comparable(entry.newPath, entry.oldText) === comparable(entry.newPath, entry.newText),
      }))
      .filter((entry) => !entry.same || entry.renamed); // drop changes a reader cannot see
  };

  /**
   * When the framework content last changed on main: the date of the most
   * recent commit on main's own line of history (so a merged pull request
   * counts from when it was merged) that really changed the framework.
   * Repository-only commits, banner or footer updates and whitespace that
   * does not change how the text looks do not count.
   */
  const lastChanged = () => {
    const commits = git("rev-list", "--first-parent", `${baseCommit}..${head}`, "--", `${FRAMEWORK_DIR}/`).split("\n").filter(Boolean);
    const commit = commits.find((each) => fileChanges(`${each}^1`, each).length > 0);
    return commit ? git("show", "-s", "--format=%cs", commit).trim() : null;
  };

  const changed = fileChanges(baseCommit, head);
  const result = {
    baseline: { ...baseline, commit: baseCommit },
    current: { commit: head, lastChanged: changed.length ? lastChanged() : null },
    unchanged: true,
    sections: [],
  };

  for (const { oldPath, newPath, oldText, newText, renamed, same } of changed) {
    const markdown = (newPath ?? oldPath).endsWith(".md");
    const status = !oldPath ? "added" : !newPath ? "removed" : renamed ? "moved" : "changed";
    const items = markdown && !same ? compareBlocks(oldText, newText, oldPath, newPath) : [];
    result.sections.push({
      path: newPath ?? oldPath,
      oldPath: renamed ? oldPath : null,
      status,
      title: markdown ? firstHeading(newText ?? oldText) || path.basename(newPath ?? oldPath) : path.basename(newPath ?? oldPath),
      url: newPath ? siteUrlFor(newPath) : null,
      slug: slugFor(newPath ?? oldPath),
      items,
      summary: summarise(status, items, renamed ? oldPath : null),
    });
  }

  result.sections.sort((a, b) => a.path.localeCompare(b.path, "en", { numeric: true }));
  const slugs = result.sections.map((section) => section.slug);
  const repeated = slugs.find((slug, i) => slugs.indexOf(slug) !== i);
  if (repeated) throw new FrameworkChangesError(`Two changed files would share the change page /changes/${repeated}/.`);
  result.unchanged = result.sections.length === 0;
  return result;
}

/** The address of a file's change page: /changes/<slug>/. */
export function slugFor(file) {
  const relative = file.slice(FRAMEWORK_DIR.length + 1);
  if (relative === "README.md") return "contents";
  if (relative.endsWith("/README.md")) return relative.slice(0, -"/README.md".length).replace(/\//g, "-");
  return path.posix.basename(relative).replace(/\.[^.]+$/, "");
}

// Markdown blocks (paragraphs, list items, headings) that a reader can see.
// Hidden anchors (<a id="..."></a>) are left out of the comparison display.
// Leading indentation is kept, because it can change how a block renders.
function blocks(source) {
  if (source === null) return [];
  return frameworkText(source)
    .split(/\n(?:[ \t]*\n)+/)
    .map((block) => block.replace(/\s+$/, ""))
    .filter((block) => block.trim() && !/^\s*(<a\s+id="[^"]*"\s*><\/a>\s*)+$/.test(block));
}

/** A block as plain text, for reading in the comparison. */
export function plainText(block) {
  return block
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => `[Image: ${alt}]`)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const isHeading = (block) => /^#{1,6}\s/.test(block);
const isListItem = (block) => /^\s*[-*+]\s/.test(block);

/** Where a link in a framework file goes, as a full address. */
function linkAddress(url, repoPath) {
  const target = siteLinkFor(url, repoPath);
  if (!target) return "";
  if (target.startsWith("#")) return siteAddress(siteUrlFor(repoPath) ?? "/", target.slice(1));
  return target.startsWith("/") ? siteAddress(target) : target;
}

/** The links and images in a block, in order: { text, url, image }. */
export function linksIn(block, repoPath) {
  const links = [];
  const visit = (tokens) => {
    let open = null;
    for (const token of tokens) {
      if (token.type === "link_open") open = { text: "", url: linkAddress(token.attrGet("href"), repoPath), image: false };
      else if (token.type === "link_close" && open) {
        links.push({ ...open, text: open.text.trim() });
        open = null;
      } else if (token.type === "image") {
        links.push({ text: token.content || "image", url: linkAddress(token.attrGet("src"), repoPath), image: true });
      } else if (open && (token.type === "text" || token.type === "code_inline")) {
        open.text += token.content;
      }
      if (token.children) visit(token.children);
    }
  };
  visit(blockRenderer.parse(block, {}));
  return links;
}

/** Links whose destination changed, or that were added or removed: { text, from, to, image }. */
function linkChanges(oldLinks, newLinks) {
  const changes = [];
  for (let i = 0; i < Math.max(oldLinks.length, newLinks.length); i++) {
    const [before, after] = [oldLinks[i], newLinks[i]];
    if (before && after && before.url === after.url) continue;
    changes.push({ text: (after ?? before).text, from: before?.url ?? null, to: after?.url ?? null, image: (after ?? before).image });
  }
  return changes;
}

// The blocks that look different, in reading order. Blocks are matched by
// how they render, so whitespace a reader cannot see does not count. A
// removed block followed by an added one is shown as one changed block:
//
// - "changed" if the wording differs, with the changed words marked, and
//   any changed links listed;
// - "link" if only link destinations differ, with the old and new ones;
// - "formatting" if the wording and links are the same.
function compareBlocks(oldSource, newSource, oldPath, newPath) {
  const items = [];
  let heading = "";
  const describe = (oldBlock, newBlock) => {
    const block = newBlock ?? oldBlock;
    const rule = RULE_NUMBER.exec(block.trim())?.[1] ?? null;
    let kind = !oldBlock ? "added" : !newBlock ? "removed" : "changed";
    let parts = [{ text: plainText(block), added: kind === "added", removed: kind === "removed" }];
    let links = [];
    if (kind === "changed") {
      links = linkChanges(linksIn(oldBlock, oldPath ?? newPath), linksIn(newBlock, newPath ?? oldPath));
      if (plainText(oldBlock) !== plainText(newBlock)) {
        parts = diffWords(plainText(oldBlock), plainText(newBlock)).map((part) => ({ text: part.value, added: !!part.added, removed: !!part.removed }));
      } else {
        kind = links.length ? "link" : "formatting";
        parts = [{ text: plainText(newBlock), added: false, removed: false }];
      }
    }
    return {
      kind,
      rule,
      // The number of the rule in the baseline's version of the block, if it
      // had one. For a changed block it can differ from `rule` when rules
      // were renumbered. Used to say why a change was made (lib/change-provenance.js).
      oldRule: oldBlock ? (RULE_NUMBER.exec(oldBlock.trim())?.[1] ?? null) : null,
      // Rule anchors exist on the current page only for rules that are still there.
      anchor: rule && kind !== "removed" ? ruleAnchor(rule) : null,
      label: rule ?? (isHeading(block) ? "Heading" : isListItem(block) ? "List item" : "Paragraph"),
      heading: isHeading(block) ? "" : heading,
      parts,
      links,
    };
  };

  const [oldBlocks, newBlocks] = [blocks(oldSource), blocks(newSource)];
  const changes = diffArrays(oldBlocks.map(blockSignature), newBlocks.map(blockSignature));
  let [o, n] = [0, 0];
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const count = change.value.length;
    if (!change.added && !change.removed) {
      for (const block of newBlocks.slice(n, n + count)) if (isHeading(block)) heading = plainText(block);
      [o, n] = [o + count, n + count];
      continue;
    }
    const removed = change.removed ? oldBlocks.slice(o, o + count) : [];
    if (change.removed) o += count;
    let added = [];
    if (change.added || changes[i + 1]?.added) {
      const addition = change.added ? change : changes[++i];
      added = newBlocks.slice(n, n + addition.value.length);
      n += addition.value.length;
    }
    for (let j = 0; j < Math.max(removed.length, added.length); j++) {
      items.push(describe(removed[j] ?? null, added[j] ?? null));
      const block = added[j] ?? removed[j];
      if (isHeading(block)) heading = plainText(block);
    }
  }
  return items;
}

function summarise(status, items, movedFrom) {
  if (status === "added") return "New section";
  if (status === "removed") return "Section removed";
  if (status === "moved") return `Moved from ${movedFrom}. The content has not changed.`;
  const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const count = (kind, rules) => items.filter((item) => item.kind === kind && !!item.rule === rules).length;
  const phrase = (n, kind, noun) => (n ? `${plural(n, noun)} ${kind}` : null);
  const links = items.reduce((total, item) => total + item.links.length, 0);
  const formatting = items.filter((item) => item.kind === "formatting").length;
  const parts = [
    phrase(count("changed", true), "changed", "rule"),
    phrase(count("added", true), "added", "rule"),
    phrase(count("removed", true), "removed", "rule"),
    phrase(count("changed", false), "changed", "other passage"),
    phrase(count("added", false), "added", "other passage"),
    phrase(count("removed", false), "removed", "other passage"),
    links ? `${plural(links, "link")} changed` : null,
    formatting ? plural(formatting, "formatting change") : null,
  ].filter(Boolean);
  const sentences = [parts.length ? `${parts.join(", ")}.` : "Hidden anchors changed. The wording is the same."];
  if (movedFrom) sentences.push(`Moved from ${movedFrom}.`);
  const text = sentences.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
