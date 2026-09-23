// Tests for lib/markdown.js. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownLibrary, stripRepositoryFurniture, firstHeading, siteUrlFor } from "../lib/markdown.js";

const BANNER =
  "<!-- caution-banner:start (wording is kept in tools/caution-banner.md; edit it there) -->\n" +
  "> [!CAUTION]\n> Working draft.\n<!-- caution-banner:end -->\n\n";
const FOOTER =
  "\n---\n\n**Repository navigation**\n\n[← Previous](01-introduction.md) · [Repository home](../../README.md)\n";

const render = (source, inputPath = "../trust-framework-1.0/part-1/02-feedback.md") =>
  markdownLibrary.render(stripRepositoryFurniture(source), { page: { inputPath } });

test("removes the caution banner and repository navigation, and nothing else", () => {
  const out = stripRepositoryFurniture(`${BANNER}## 2. Title\n\n2.1. Policy text.\n${FOOTER}`);
  assert.equal(out.includes("caution-banner"), false);
  assert.equal(out.includes("Repository navigation"), false);
  assert.match(out, /2\.1\. Policy text\./);
});

test("keeps a horizontal rule that is not the repository navigation", () => {
  const out = stripRepositoryFurniture("## Title\n\nBefore.\n\n---\n\nAfter the rule.\n");
  assert.match(out, /After the rule\./);
});

test("uses the first heading as the title and does not repeat it in the body", () => {
  const source = `${BANNER}## 12. Service requirements\n\nText.\n`;
  assert.equal(firstHeading(source), "12. Service requirements");
  assert.equal(render(source).includes("12. Service requirements"), false);
});

test("moves headings up so the body starts at h2, and never skips a level", () => {
  const html = render("## 4. Title\n\n### 4.1. Roles\n\n> ##### Illustrative example 1\n>\n> Example text.\n");
  assert.match(html, /<h2[^>]*>4\.1\. Roles<\/h2>/);
  assert.match(html, /<h3[^>]*>Illustrative example 1<\/h3>/);
});

test("maps repository paths to site addresses", () => {
  assert.equal(siteUrlFor("README.md"), "/");
  assert.equal(siteUrlFor("CONTRIBUTING.md"), "/feedback/");
  assert.equal(siteUrlFor("trust-framework-1.0/README.md"), "/trust-framework-1.0/");
  assert.equal(siteUrlFor("trust-framework-1.0/part-3/12-service-requirements.md"), "/trust-framework-1.0/part-3/12-service-requirements/");
  assert.equal(siteUrlFor("media/Image_2.svg"), "/media/Image_2.svg");
  assert.equal(siteUrlFor("VERSIONS.md"), null);
});

test("rewrites links between Markdown files, keeping anchors", () => {
  const html = render("## T\n\nSee [section 12](../part-3/12-service-requirements.md#section-12_4) and [versions](../../VERSIONS.md).\n");
  assert.match(html, /href="\/trust-framework-1\.0\/part-3\/12-service-requirements\/#section-12_4"/);
  assert.match(html, /href="https:\/\/github\.com\/ofdia-uk\/dvs-trust-framework\/blob\/main\/VERSIONS\.md"/);
});

test("leaves external links alone", () => {
  const html = render("## T\n\n[GOV.UK](https://www.gov.uk/)\n");
  assert.match(html, /href="https:\/\/www\.gov\.uk\/"/);
});

test("renders bold cells in a single-column table as row headers", () => {
  const html = render("## T\n\n| STANDARD |\n| --- |\n| **Rules for identity service providers** |\n| A standard |\n");
  assert.match(html, /<th scope="row" class="govuk-table__header">Rules for identity service providers<\/th>/);
  assert.match(html, /<td class="govuk-table__cell">A standard<\/td>/);
});

test("leaves bold cells alone in tables with more than one column", () => {
  const html = render("## T\n\n| A | B |\n| --- | --- |\n| **Bold** | text |\n");
  assert.equal(html.includes('scope="row"'), false);
});

test("uses the abbreviation definitions kept in a hidden comment", () => {
  const source =
    "## T\n\nA DVS is a service.\n\n" +
    "<!-- Abbreviation definitions from the GOV.UK publication source. Not displayed on GitHub.\n" +
    "*[DVS]: Digital Verification Service\n-->\n";
  const html = render(source);
  assert.match(html, /<abbr title="Digital Verification Service">DVS<\/abbr>/);
  assert.equal(html.includes("*[DVS]"), false);
  assert.equal(html.includes("Abbreviation definitions"), false);
});

test("does not wrap an invisible anchor in an empty paragraph", () => {
  const html = render('## T\n<a id="section-12"></a>\n\nText.\n');
  assert.equal(/<p[^>]*>\s*<a id="section-12"><\/a>\s*<\/p>/.test(html), false);
  assert.match(html, /<a id="section-12"><\/a>/);
});

test("passes template-like text through unchanged", () => {
  const html = render("## T\n\nText with {{ braces }} and {% tags %}.\n");
  assert.match(html, /\{\{ braces \}\} and \{% tags %\}/);
});
