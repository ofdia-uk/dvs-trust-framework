// Eleventy configuration for the reading site.
//
// The site renders the Markdown files in the repository as they are. It does
// not keep its own copy of the text. The input directory is the repository
// root, and only the trust framework and the feedback guidance become pages.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import { EleventyHtmlBasePlugin } from "@11ty/eleventy";
import { markdownLibrary, stripRepositoryFurniture, firstHeading, siteUrlFor, REPOSITORY_URL } from "./lib/markdown.js";
import { feedbackUrl, markdownLink, siteAddress, ruleGroups } from "./lib/feedback.js";
import { frameworkChanges } from "./lib/changes.js";
import { buildSearchIndex } from "./lib/search.js";
import { pageContents, contentsLength } from "./lib/contents.js";
import { loadRuleIdentities } from "./lib/rule-identities.js";
import { loadExistingFeedback } from "./lib/existing-feedback.js";
import { loadChangeProvenance } from "./lib/change-provenance.js";
import site from "./_data/site.js";

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const GOVUK_FRONTEND = path.join(SITE_DIR, "node_modules", "govuk-frontend", "dist");

/** Repository-relative path of a page's source file, for example "trust-framework-1.0/README.md". */
const repoPathOf = (inputPath) => inputPath.replace(/\\/g, "/").replace(/^(\.\.\/|\.\/)+/, "");

/**
 * Changes to the trust framework since its baseline, for the "What's changed"
 * pages. In CI a problem, such as a missing baseline tag or incomplete Git
 * history, stops the build, so the site never wrongly says nothing changed.
 * A local build without the history says the information is not available.
 */
function loadFrameworkChanges() {
  try {
    return { available: true, ...frameworkChanges(path.resolve(SITE_DIR, "..")) };
  } catch (error) {
    if (process.env.CI || process.env.GITHUB_ACTIONS) throw error;
    console.warn(`[framework changes] Not available: ${error.message}`);
    return { available: false, reason: error.message, sections: [] };
  }
}

/** Numbered section files in reading order: 0, 1, 2 … 16. */
const sectionNumber = (item) => Number(path.basename(item.inputPath).slice(0, 2));

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);

  eleventyConfig.setLibrary("md", markdownLibrary);
  eleventyConfig.setLibrary(
    "njk",
    new nunjucks.Environment(
      new nunjucks.FileSystemLoader([path.join(SITE_DIR, "_includes"), GOVUK_FRONTEND]),
      { autoescape: true, throwOnUndefined: false },
    ),
  );

  // The Markdown is written for GitHub; remove the banner and repository
  // navigation, which the site layout replaces.
  eleventyConfig.addPreprocessor("repository-furniture", "md", (data, content) => stripRepositoryFurniture(content));

  // Only the trust framework, the feedback guidance and the site's own pages.
  for (const pattern of [
    "../README.md", "../ARCHITECTURE.md", "../VERSIONS.md", "../SECURITY.md", "../LICENCE.md",
    "../media/**", "../tools/**", "../.github/**",
    "../docs-site/README.md", "../docs-site/node_modules/**", "../docs-site/_site/**",
  ]) {
    eleventyConfig.ignores.add(pattern);
  }

  eleventyConfig.addPassthroughCopy({
    "../media": "media",
    "assets/back-to-top.js": "assets/back-to-top.js",
    "assets/init.js": "assets/init.js",
    "assets/rule-actions.js": "assets/rule-actions.js",
    "assets/rule-forward.js": "assets/rule-forward.js",
    "assets/rule-links.js": "assets/rule-links.js",
    "assets/rule-filter.js": "assets/rule-filter.js",
    "assets/rule-picker-filter.js": "assets/rule-picker-filter.js",
    "assets/search.js": "assets/search.js",
    "assets/search-core.js": "assets/search-core.js",
    [path.join("node_modules", "govuk-frontend", "dist", "govuk", "govuk-frontend.min.js")]: "assets/govuk-frontend.min.js",
  });

  eleventyConfig.addGlobalData("eleventyComputed", {
    repoPath: (data) => repoPathOf(data.page.inputPath),
    permalink: (data) => {
      if (data.permalink) return data.permalink;
      return siteUrlFor(repoPathOf(data.page.inputPath)) ?? false;
    },
    title: (data) => {
      if (data.title) return data.title;
      if (!data.page.inputPath.endsWith(".md")) return "";
      return firstHeading(fs.readFileSync(data.page.inputPath, "utf-8"));
    },
  });
  // Default layout for pages rendered from Markdown. (Eleventy resolves layouts
  // before computed data, so this has to be ordinary global data.)
  eleventyConfig.addGlobalData("layout", "layouts/page.njk");

  eleventyConfig.addCollection("sections", (collectionApi) =>
    collectionApi
      .getFilteredByGlob(["../trust-framework-1.0/*.md", "../trust-framework-1.0/*/*.md"])
      .filter((item) => /^\d\d-/.test(path.basename(item.inputPath)))
      .sort((a, b) => sectionNumber(a) - sectionNumber(b)),
  );

  // The "On this page" list: the page's subsections and the headings under them. See lib/contents.js.
  eleventyConfig.addFilter("pageContents", pageContents);
  eleventyConfig.addFilter("contentsLength", contentsLength);
  const partOf = (repoPath) => {
    const match = /^trust-framework-1\.0\/part-(\d)\//.exec(repoPath ?? "");
    return match ? Number(match[1]) : null;
  };
  eleventyConfig.addFilter("partOf", partOf);
  // The search index (/search-index.json), made from the trust framework sections. See lib/search.js.
  eleventyConfig.addFilter("searchIndex", (sections, identities) =>
    JSON.stringify(
      buildSearchIndex(
        sections.map((item) => {
          const part = site.parts.find((each) => each.number === partOf(item.data.repoPath));
          return { url: item.url, title: item.data.title, repoPath: item.data.repoPath, part: part && `Part ${part.number}: ${part.title}` };
        }),
        undefined,
        identities,
      ),
    ),
  );
  // The page-level feedback link fills in the page title as a link to the page.
  eleventyConfig.addFilter("pageFeedbackUrl", (pageUrl, title) =>
    feedbackUrl(REPOSITORY_URL, markdownLink(title, siteAddress(pageUrl))),
  );
  // The rules in a page, for its rule picker.
  eleventyConfig.addFilter("ruleGroups", ruleGroups);
  eleventyConfig.addGlobalData("repositoryUrl", REPOSITORY_URL);

  // Each rule's permanent identity, from rule-identities.json, and where it is
  // now. Read again for every build. If the registry and the trust framework
  // disagree, the build stops and says what to decide. See lib/rule-identities.js.
  eleventyConfig.addGlobalData("ruleIdentities", () => loadRuleIdentities(path.resolve(SITE_DIR, "..")));
  // The existing feedback that maintainers have chosen to show, from
  // existing-feedback.json, attached to rules by their permanent identity. If
  // an entry is wrong or out of date, the build stops and says what to
  // change. See lib/existing-feedback.js.
  eleventyConfig.addGlobalData("existingFeedback", () => {
    const root = path.resolve(SITE_DIR, "..");
    return loadExistingFeedback(root, loadRuleIdentities(root));
  });
  // On a "What's changed" page, where a removed rule's number leads now: the
  // permanent page of the one identity that had it, if no rule has it now.
  eleventyConfig.addFilter("formerRuleHref", (number, identities) => {
    const holders = identities.formerHolders[number];
    return !identities.byNumber[number] && holders?.length === 1 ? holders[0].permanentUrl : null;
  });

  const changes = loadFrameworkChanges();
  eleventyConfig.addGlobalData("frameworkChanges", changes);
  // Why changes were made, shown on the "What's changed" pages only where a
  // maintainer has recorded it in change-provenance.json, attached to rules
  // by their permanent identity. If an entry is wrong, or explains something
  // that has not changed since the baseline, the build stops and says what
  // to change. See lib/change-provenance.js.
  eleventyConfig.addGlobalData("changeProvenance", () => {
    const root = path.resolve(SITE_DIR, "..");
    return loadChangeProvenance(root, loadRuleIdentities(root), changes);
  });
  // A date such as 2026-10-02, written as 2 October 2026.
  eleventyConfig.addFilter("readableDate", (isoDate) =>
    new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  );
  // The change to a framework page's source file since the baseline, if any.
  eleventyConfig.addFilter("frameworkChangeFor", (repoPath) => changes.sections.find((section) => section.path === repoPath) ?? null);
}

export const config = {
  dir: {
    input: "..",
    includes: "docs-site/_includes",
    data: "docs-site/_data",
    output: "_site",
  },
  templateFormats: ["md", "njk"],
  // The Markdown is policy text: never run it through a template engine.
  markdownTemplateEngine: false,
  htmlTemplateEngine: "njk",
  pathPrefix: process.env.PATH_PREFIX || "/",
};
