// Markdown rendering for the reading site.
//
// The Markdown files are written for GitHub. This module renders the same
// files as web pages without changing them:
//
// - removes the repository caution banner and the "Repository navigation"
//   footer, which the site layout replaces with its own status banner and
//   page navigation;
// - uses the page's first heading as its title, and moves the remaining
//   headings up a level so each page has one <h1> and no skipped levels;
// - rewrites links between Markdown files to the site's page addresses;
// - applies GOV.UK Frontend classes to the rendered HTML;
// - uses the abbreviation definitions kept in a hidden comment in section 16
//   to explain abbreviations, and renders the bold row headings in the
//   section 15 table as table row headers, as the GOV.UK publication does.

import path from "node:path";
import markdownIt from "markdown-it";
import markdownItAbbr from "markdown-it-abbr";
import markdownItAnchor from "markdown-it-anchor";

export const REPOSITORY_URL = "https://github.com/ofdia-uk/dvs-trust-framework";

const BANNER = /^<!-- caution-banner:start[^\n]*-->\r?\n[\s\S]*?^<!-- caution-banner:end -->\r?\n/m;
const REPO_FOOTER = /\r?\n(?:---|\*\*\*|___)\s*\r?\n+\*\*Repository navigation\*\*[\s\S]*$/;
const BACK_SECTION = /\r?\n## Back\s*\r?\n[\s\S]*$/;
const FIRST_HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/m;

// Section 16 keeps the GOV.UK abbreviation definitions (*[DVS]: ...) inside an
// HTML comment so that GitHub does not display them. Uncomment them for the
// site so that they explain abbreviations, as they do on GOV.UK.
const ABBREVIATION_COMMENT = /^<!-- Abbreviation definitions from the GOV\.UK publication source\.[^\n]*\r?\n([\s\S]*?)\r?\n-->[ \t]*$/m;

/** Prepare a Markdown file for rendering: remove repository-only material. */
export function stripRepositoryFurniture(source) {
  return source
    .replace(BANNER, "")
    .replace(REPO_FOOTER, "\n")
    .replace(BACK_SECTION, "\n")
    .replace(ABBREVIATION_COMMENT, "$1");
}

/** The text of the first heading in a Markdown file, used as the page title. */
export function firstHeading(source) {
  const match = stripRepositoryFurniture(source).match(FIRST_HEADING);
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

/** The site address for a repository path, or null if it is not a site page. */
export function siteUrlFor(repoPath) {
  if (repoPath === "README.md") return "/";
  if (repoPath === "CONTRIBUTING.md") return "/feedback/";
  if (repoPath.startsWith("media/")) return `/${repoPath}`;
  if (repoPath.startsWith("trust-framework-1.0/") && repoPath.endsWith(".md")) {
    return `/${repoPath.replace(/README\.md$/, "").replace(/\.md$/, "/")}`;
  }
  return null;
}

function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}_\- ]/gu, "")
    .replace(/ /g, "-");
}

// Resolve relative links against the source file and map them to site pages.
// Links to repository files that are not site pages go to GitHub instead.
function rewriteLinks(md) {
  md.core.ruler.push("site_links", (state) => {
    const inputPath = state.env?.page?.inputPath;
    if (!inputPath) return;
    const sourceDir = path.posix.dirname(inputPath.replace(/\\/g, "/").replace(/^(\.\.\/|\.\/)+/, ""));
    const rewrite = (url) => {
      if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("#") || url.startsWith("/")) return url;
      const [target, fragment] = url.split("#");
      const repoPath = path.posix.normalize(path.posix.join(sourceDir, decodeURI(target)));
      const siteUrl = siteUrlFor(repoPath);
      const base = siteUrl ?? `${REPOSITORY_URL}/blob/main/${repoPath}`;
      return fragment ? `${base}#${fragment}` : base;
    };
    const visit = (tokens) => {
      for (const token of tokens) {
        if (token.type === "link_open") token.attrSet("href", rewrite(token.attrGet("href")));
        if (token.type === "image") token.attrSet("src", rewrite(token.attrGet("src")));
        if (token.children) visit(token.children);
      }
    };
    visit(state.tokens);
  });
}

// The first heading becomes the page title (rendered by the layout), so it
// is removed here and the rest are moved up to start at <h2>.
function titleAndHeadingLevels(md) {
  md.core.ruler.push("site_headings", (state) => {
    const tokens = state.tokens;
    const first = tokens.findIndex((t) => t.type === "heading_open");
    if (first === -1) return;
    tokens.splice(first, 3);
    const levels = tokens.filter((t) => t.type === "heading_open").map((t) => Number(t.tag.slice(1)));
    if (!levels.length) return;
    const shift = Math.min(...levels) - 2;
    // Never let a heading skip a level (for example the example-box headings,
    // which follow a section heading two levels up). Only the level changes.
    let previous = 1;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "heading_open") continue;
      const level = Math.min(6, Math.max(2, Number(tokens[i].tag.slice(1)) - shift), previous + 1);
      tokens[i].tag = `h${level}`;
      const close = tokens.findIndex((t, j) => j > i && t.type === "heading_close");
      tokens[close].tag = `h${level}`;
      previous = level;
    }
  });
}

// A line holding only an invisible anchor (<a id="section-12"></a>) would
// otherwise render as an empty paragraph with spacing around it.
function bareAnchors(md) {
  const anchorOnly = /^(\s*<a\s+id="[^"]+"\s*><\/a>\s*)+$/;
  md.core.ruler.push("bare_anchors", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      if (tokens[i].type === "paragraph_open" && tokens[i + 1].type === "inline" && anchorOnly.test(tokens[i + 1].content)) {
        tokens[i].hidden = true;
        tokens[i + 2].hidden = true;
      }
    }
  });
}

// Row headings in a single-column table are written as bold cells (the
// section 15 table of standards). Render them as <th scope="row">, as GOV.UK
// does. A cell counts only if its whole content is bold.
function boldRowHeaders(md) {
  md.core.ruler.push("bold_row_headers", (state) => {
    const tokens = state.tokens;
    let columns = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === "table_open") {
        const firstRowEnd = tokens.findIndex((t, j) => j > i && t.type === "tr_close");
        columns = tokens.slice(i, firstRowEnd).filter((t) => t.type === "th_open" || t.type === "td_open").length;
        continue;
      }
      if (token.type !== "td_open" || columns !== 1) continue;
      // Ignore whitespace-only text around the bold run.
      const children = (tokens[i + 1]?.children ?? []).filter((c) => !(c.type === "text" && c.content.trim() === ""));
      const whollyBold =
        children.length >= 3 &&
        children[0].type === "strong_open" &&
        children.at(-1).type === "strong_close" &&
        children.slice(1, -1).every((c) => c.type !== "strong_open" && c.type !== "strong_close");
      if (!whollyBold) continue;
      token.tag = "th";
      token.attrSet("scope", "row");
      token.meta = { ...(token.meta || {}), rowHeader: true };
      tokens[i + 2].tag = "th";
      tokens[i + 1].children = children.slice(1, -1);
    }
  });
}

function govukClasses(md) {
  const addClass = (name, classes) => {
    const previous = md.renderer.rules[name] ?? ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules[name] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const value = typeof classes === "function" ? classes(token) : classes;
      if (value) token.attrJoin("class", value);
      return previous(tokens, idx, options, env, self);
    };
  };
  const headingClass = { h2: "govuk-heading-l", h3: "govuk-heading-m", h4: "govuk-heading-s", h5: "govuk-heading-s", h6: "govuk-heading-s" };
  addClass("heading_open", (t) => headingClass[t.tag]);
  addClass("paragraph_open", (t) => (t.hidden ? "" : "govuk-body"));
  addClass("bullet_list_open", "govuk-list govuk-list--bullet");
  addClass("ordered_list_open", "govuk-list govuk-list--number");
  addClass("blockquote_open", "govuk-inset-text");
  addClass("link_open", "govuk-link");
  addClass("hr", "govuk-section-break govuk-section-break--l govuk-section-break--visible");
  addClass("table_open", "govuk-table");
  addClass("thead_open", "govuk-table__head");
  addClass("tbody_open", "govuk-table__body");
  addClass("tr_open", "govuk-table__row");
  addClass("th_open", (t) => {
    t.attrSet("scope", "col");
    return "govuk-table__header";
  });
  addClass("td_open", (t) => (t.meta?.rowHeader ? "govuk-table__header" : "govuk-table__cell"));
  // Wrap tables so wide ones scroll horizontally instead of widening the page.
  const tableOpen = md.renderer.rules.table_open;
  md.renderer.rules.table_open = (...args) => `<div class="app-table-wrapper">\n${tableOpen(...args)}`;
  md.renderer.rules.table_close = () => "</table>\n</div>\n";
  addClass("code_inline", "app-code");
}

export const markdownLibrary = markdownIt({ html: true, linkify: false, typographer: false })
  .use(markdownItAbbr)
  .use(titleAndHeadingLevels)
  .use(markdownItAnchor, { slugify: githubSlug, tabIndex: false })
  .use(rewriteLinks)
  .use(bareAnchors)
  .use(boldRowHeaders)
  .use(govukClasses);
