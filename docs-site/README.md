# Reading site

The source for the reading website: <https://ofdia-uk.github.io/dvs-trust-framework/>.

The site shows the working draft of the trust framework to people who would rather not use GitHub. It is for reading only. Feedback, review and history stay on GitHub, and every page links back there.

## How it works

The site has no copy of the text. [Eleventy](https://www.11ty.dev/) renders the Markdown files in `trust-framework-1.0/` and `CONTRIBUTING.md` directly from the repository. Rendering never changes the source files. [`lib/markdown.js`](lib/markdown.js) turns the GitHub-oriented Markdown into web pages:

- It removes each file's caution banner and "Repository navigation" footer. Every page shows a "Draft" status banner instead.
- It uses the first heading as the page title, and keeps the other headings in order without skipping levels.
- It points links between Markdown files at the matching site pages. Links to other repository files go to GitHub.
- It uses the abbreviation definitions kept in a hidden comment in section 16 to explain abbreviations on hover. It renders the bold row headings in the section 15 table as table row headers. Both match GOV.UK.
- It gives each numbered rule (for example 12.4.1.c) an anchor made from its number, such as `#section-12_4_1_c`, and marks it for rule-level feedback and copying, with its permanent identity. See [Feedback links](#feedback-links), [Rule links and references](#rule-links-and-references) and [Permanent rule links](#permanent-rule-links).
- It gives each glossary term in section 16 an anchor made from the term, such as `#term-identity-repair`, so that search results can link to it.
- It applies GOV.UK Frontend styles.

Each page with three or more headings starts with an "On this page" list. See [Navigating a page](#navigating-a-page).

The site also has a search page and a "What's changed" page. See [Search](#search) and [Changes to the trust framework](#changes-to-the-trust-framework).

The Markdown is never processed by a template engine, so nothing in the policy text can be interpreted as code.

## Feedback links

Every feedback link opens the issue template chooser on GitHub, so the reader still picks the kind of feedback. GitHub passes the "Rule, paragraph or page" field (id `reference`) through the chooser to the form the reader picks, and every form has that field. The reader can change it before submitting. GitHub fills in text fields from a link, but not dropdowns, so the reader still chooses the section. The links add no labels; each form's labels apply as before.

- **Page:** the "Give feedback on GitHub" link at the bottom of each trust framework page fills in the page title as a link to the page. It works without JavaScript.
- **From anywhere:** the "Draft" status banner at the top of every page ends "or give feedback on this draft", so general feedback can be started without scrolling to the bottom or going back to the home page. It is visible on phones without opening the menu. On a trust framework page it fills in that page, exactly as the page's own "Give feedback on GitHub" link does, so no rule is named. On other pages, such as the home page, search and "What's changed", it fills in nothing. It is made when the site is built, so it works without JavaScript. The header's "Give feedback" item still goes to the guidance page. The site check fails if a page's banner has no feedback link, or fills in the wrong page.
- **Rule:** pointing to a rule highlights it and shows a "Give feedback on 12.4.1.c" link beside it, with the copy buttons described in [Rule links and references](#rule-links-and-references). On a touch screen, tapping a rule does the same, and tapping it again or elsewhere clears it. The link fills in the rule's current number as a Markdown link to its permanent link, for example `[12.4.1.c](https://…/rules/r0254/)`, so the issue shows "12.4.1.c" as a link that still goes to the rule if it is later renumbered or moved. There is only one set of these at a time, so the rules add nothing to the Tab order. [`assets/rule-actions.js`](assets/rule-actions.js) does this.
- **Rule picker:** for keyboard and screen reader users, and without JavaScript, each page with rules has a "Give feedback on a specific rule" form at the bottom, with a dropdown of its rules grouped by heading. A skip link to it appears at the top of the page when it has keyboard focus. With JavaScript, "Continue to GitHub" with no rule chosen shows an error and moves focus to the dropdown instead of opening an empty form.
- **Filtering the picker:** with JavaScript, the picker gets a "Filter the rules in this section" box. Typing a rule number, whole or in part (`12.4.1`, `Rule 12.4.1.c`), or a word from a heading (`fraud`) narrows the same dropdown to the rules that match, under their headings, and says how many match. Numbers match whole parts, so `2.1.1` does not match 2.1.10.a. It looks only at the numbers and headings already in the dropdown; it is not a search of the rules' text. Typing never chooses a rule, submits or copies anything, or moves focus, and pressing Enter in the box does nothing. Any change to the box clears the chosen rule and says so, so the buttons can never act on a rule chosen before the filter changed. "Clear filter", or emptying the box, puts every rule back in its place. Tapping a rule on the page that the filter is hiding clears the filter and chooses that rule. [`assets/rule-picker-filter.js`](assets/rule-picker-filter.js) does this, with the matching in [`assets/rule-filter.js`](assets/rule-filter.js), which the tests check. It is a separate script, so if it does not load the rule actions still work, and the other way round. The filter is added only once it is ready; if anything goes wrong later, every rule is put back in the dropdown in its original order and the filter is removed.

### Existing feedback

Feedback that maintainers have chosen to show, listed in [`existing-feedback.json`](../existing-feedback.json), is linked from the rules and sections it is about. Being public on GitHub is not enough. [ARCHITECTURE.md](../ARCHITECTURE.md#existing-feedback-on-the-reading-site) explains how maintainers choose and remove it. [`lib/existing-feedback.js`](lib/existing-feedback.js) checks the file against the rule identities and the trust framework, and the build stops if they disagree.

- **Rule:** a rule with feedback gets `data-feedback-count` and `data-feedback-href` on its block, and its actions gain "See existing feedback on 12.4.1.c (3)" after "Give feedback on 12.4.1.c". The address is relative to the site root and is resolved by [`assets/rule-links.js`](assets/rule-links.js), so it works under a path prefix. Other rules get nothing.
- **Section:** a section with feedback, about itself or any rule in it, gets "See existing feedback about this section (4)" in its "Give feedback on this page" list. Each issue is counted once. This link works without JavaScript.
- **The page** (`/existing-feedback/`, [`pages/existing-feedback.njk`](pages/existing-feedback.njk)) lists the issues by section in reading order, then by rule, with each rule's group at `#rule-r0254`. It shows the maintainer's title and a link to the issue on GitHub, never the issue's text. Titles are escaped. It says that being listed does not mean OfDIA agrees.

The site check fails if a count disagrees with the page, a link goes to the wrong place, something listed is not linked from its rule or section, or an issue link does not go to that issue.

A link to a rule anchor highlights the whole rule in pale yellow: its first paragraph and everything that belongs to it, such as its list, table or figures, and nothing of the next rule. The highlight uses the rule's block, so it follows the same rule boundaries as feedback (`ruleBoundaries` in `lib/markdown.js`). It is done in CSS (`:has()` and `:target`), so it needs no JavaScript and follows links on the page and Back and Forward. Browsers without `:has()` highlight the first paragraph only. For example, 4.1.b includes its table (Figure 1), 4.3.c its Figures 2 and 3, and 12.9.b its Figure 4, because they belong to those rules. Every block holds exactly one rule, and the site check fails otherwise.

All of this is made when the site is built. A rule is a paragraph that starts with its number, such as "12.4.1.c." or "12.4.1.c", so new rules get an anchor and feedback route automatically. A new rule also needs a permanent identity, which a maintainer records in `rule-identities.json`; until then the build says so and stops (see [Permanent rule links](#permanent-rule-links)). The Markdown is not changed. The tests fail if a paragraph looks like a numbered rule but the renderer does not recognise it, if a rule is missing its anchor or feedback route, or if an ID is repeated. The site check does the same on the built pages.

The addresses in the links use `SITE_URL`. The Reading site workflow sets it to the GitHub Pages address of the repository it runs in. Without it, the address of the OfDIA site is used.

## Search

The search page (`/search/`) finds a rule or section by its number, and passages by the words in them. A search form on the home page and a "Search" link in the navigation lead to it.

**Rule and section numbers.** A search for `12.4.1.c` or `Rule 12.4.1.C.` finds rule 12.4.1.c. Case, spaces, a full stop at the end and a leading "rule" or "section" do not matter. Sections (`12`) and subsections (`12.4`, `12.4.1`) work too. The page shows the rule first, with the headings it comes under and the start of its text, then a "Go to rule 12.4.1.c" link to the rule's anchor, and any other passages that mention it. A number that does not exist says so, and offers the nearest section that does exist, by name. Search never goes to a different rule without saying so. Numbered paragraphs at the start of a section, such as 13.a, are not rules on the site and have no anchor, so they link to the start of their section.

**Former numbers and permanent identities.** A search for a number that a rule used to have says what the rule is now ("Rule 12.4.1.c is now rule 12.4.1.d"), or that it has been removed, with a link to its permanent link. If the number has been used for more than one rule, search lists them all and does not choose. If a rule has the number now, it is shown first, followed by the other rules that have had the number. A search for a permanent identifier, such as `r0254`, finds that rule. Results found this way link to the rule's block (`#rule-r0254`), as its permanent link does.

**Words.** Every word searched for must be in the passage or in the headings it comes under. Common words such as "the" are ignored, letters and digits are split ("GPG45" is "GPG 45"), and a plural matches its singular ("biometrics" finds "biometric"). Matches in headings and glossary terms, and the words together as a phrase, come first. Each result links to the passage: a rule to its anchor, a glossary term to the term, other paragraphs to the heading they come under, and rows of the table of standards to section 15.

**The address.** The search is in the page address (`/search/?q=identity+repair`), so a search can be shared, reloaded or returned to with Back. Each search loads the page again. The number of results is announced once, not while the reader types. Queries and passages are written to the page as text, never as HTML.

**When search cannot run.** Search needs JavaScript. As built, the search page shows another way to find a rule: how to find a rule by its section, and links to every section. The search results area starts hidden. `assets/search.js` shows it and hides the fallback only once the script is running, so the fallback stays if JavaScript is off or if `search.js` or `search-core.js` does not load, whether or not GOV.UK Frontend's scripts run. While the search index loads, the page says "Loading search…". If the index cannot be loaded or read, the page says search is not working and shows the fallback again. The site check fails if the built search page does not start this way.

### How the search index is made

[`lib/search.js`](lib/search.js) makes the search index (`/search-index.json`) when the site is built. It parses each numbered section with the site's own Markdown renderer, so every anchor in the index is one the page has. It uses the same rule boundaries as the rule feedback blocks (`ruleBoundaries` in `lib/markdown.js`), so a rule includes its lists. The index has an entry for each section, heading, rule, other paragraph, glossary term and row of the table of standards, with the headings each one comes under.

The index has only the numbered sections. It leaves out the contents pages, the feedback guidance, the "What's changed" pages, the caution banner and repository navigation, and everything the site layout adds, such as the navigation, the draft banner and the feedback controls. Page addresses in the index are relative to the home page. The search page works out the home page from the address of its own script, so search works at `/` locally and at `/dvs-trust-framework/` on GitHub Pages.

[`assets/search-core.js`](assets/search-core.js) does the searching, and [`assets/search.js`](assets/search.js) shows the results. The index is about 250 KB (about 55 KB compressed), and only the search page loads it. Matching runs in the reader's browser, against the index the site serves. There is no external search service, and search adds no accounts or analytics. The search is part of the page address (`/search/?q=…`), so the query is sent to the site's host (GitHub Pages) when the page is requested, like any page address, and may appear in its logs.

### Maintaining search

The index needs no updating by hand: new or renumbered rules, headings and glossary terms are found when the site is built. (Renumbering a rule does need its permanent identity updating; see [Permanent rule links](#permanent-rule-links).) The tests fail if a rule or numbered heading cannot be found by its number, if an index entry links to an anchor the page does not have, or if site navigation or feedback text gets into the index. The site check does the same on the built site.

Search matches words only. It does not know synonyms, so "ID" does not find "identity". To change how results are ranked, edit `search` in `assets/search-core.js` and check the example searches in `test/search.test.js`.

## Navigating a page

Each page with three or more headings starts with an "On this page" list ([`lib/contents.js`](lib/contents.js)). It lists the page's subsections, such as 12.4, with the headings under each, such as 12.4.1, in a smaller indented list. It goes no deeper and never lists rules, so section 12, the longest, has about 30 links in 9 groups. Headings in example boxes are left out. Each link uses the heading's existing id. The list is in a `<nav>` at the top of the page, inside an "On this page" disclosure (GOV.UK Details, a native `<details>`) that is closed when the page opens, so the section's text starts straight away. It opens and closes without JavaScript, and following a link in it leaves it open. There is no sticky sidebar: the text is in one narrow column, and a disclosure at the top works the same on every screen.

### Back to top

On wide screens (GOV.UK Frontend's desktop breakpoint and up), every page has a "Back to top" link, with an upward arrow, that goes to the header (`#top`), where the navigation is. It is in the shared layout ([`_includes/layouts/base.njk`](_includes/layouts/base.njk)), at the end of the footer.

- **With JavaScript,** [`assets/back-to-top.js`](assets/back-to-top.js) fixes it to the bottom right of the window once the reader is about one window height down the page, however they got there: scrolling, a link to a rule further down, or the browser restoring their place. Nearer the top it is hidden, so it is not in the Tab order or read out. Following it jumps straight to the top, without changing the page address or adding to the history, and moves focus to the header, so the next Tab reaches the navigation.
- **Without JavaScript,** or if the script fails, it is an ordinary link at the end of the footer. The script fixes it to the window only once everything is ready, and the link keeps its address, so it always goes to the top.
- **Placement.** The space it takes at the end of the footer is kept either way, so the page does not move when the script starts, and at the end of the page it covers nothing of the footer. When focus moves with the keyboard, the browser keeps the focused element above it (`scroll-padding-bottom`). Just above the breakpoint, the rule actions beside a rule reach the right of the window, so they can be under it while the rule is at the very bottom of the window; scrolling a little shows them.
- **Not shown** on narrower screens, including a desktop browser zoomed in so far that the page is narrower than that breakpoint, or in print.

The site check fails if a page has no "Back to top" link, if it does not say so in words, if it does not go to `#top` on the page, or if it is hidden as built.

## Rule links and references

With a rule's feedback link, readers get two buttons:

- **Copy link** copies the rule's permanent link, for example `https://ofdia-uk.github.io/dvs-trust-framework/rules/r0254/`. It keeps working if the rule is renumbered or moved. See [Permanent rule links](#permanent-rule-links). It is made from the address of the site being read, so it is right at `/`, under `/dvs-trust-framework/` and in a fork.
- **Copy reference** copies the rule's citation by its current number, for example `Rule 12.4.1.c`.

The number comes from the rule block's `data-rule` and the identity from its `data-rule-id`, as the renderer wrote them, never from the rule's position. [`assets/rule-links.js`](assets/rule-links.js) works these out, and the tests check them.

- **Who can use them.** The buttons appear with the feedback link for the rule that is pointed to or tapped, and for the rule the page was opened at or a link on the page went to. Pressing Tab from a linked rule reaches them, after any links in the rule itself. Focus is never moved there on its own. The rule picker at the bottom of the page also gets copy buttons for the chosen rule, so a keyboard user can copy any rule. The buttons' names include the rule, for example "Copy link to rule 12.4.1.c".
- **Staying put.** While focus is in the buttons, while a copy is in progress, or while the "copy it yourself" box is open, they stay with their rule: pointing to another rule does not move them. Each copy works out its rule and text when the button is pressed.
- **After copying.** Focus stays on the button, "Link copied" or "Reference copied" appears, and a status message is announced.
- **If copying does not work** (some browsers or settings block it), a labelled box with the link or reference appears, focused and selected, with instructions to copy it by hand. It stays until Escape is pressed (which returns focus to the button), another copy is made, or the reader clicks elsewhere. Beside a rule on wide screens it is at most as wide as the space there, so it never runs off the page.
- **Without JavaScript** there are no copy buttons and no filter. The rule anchors, the highlighting and the picker's dropdown and GitHub route still work.

None of this text is in the search index, which is made from the Markdown.

## Permanent rule links

Each rule has a permanent identity, such as `r0254`, recorded in [`rule-identities.json`](../rule-identities.json). The identity stays the same when the rule's number, wording, section or position changes. [ARCHITECTURE.md](../ARCHITECTURE.md#rule-identities) explains the registry and how maintainers keep it up to date. [`lib/rule-identities.js`](lib/rule-identities.js) reads it, checks it against the Markdown, and works out where each identity is now. It finds the rules with `ruleBoundaries`, through the search index's parsing, so a rule is the same everywhere on the site. If the registry and the Markdown disagree, the build stops and says what a maintainer needs to decide. `npm run rules` runs the same check on its own; see [Run it locally](#run-it-locally).

**The current number and the permanent identity.** Readers see and cite the current number: "Rule 12.4.1.c". The identity is in the rule's block as `data-rule-id`, and the block has an anchor made from it, such as `#rule-r0254`.

**The permanent link** is `/rules/r0254/`. Every identity has a page there ([`pages/rule-identity.njk`](pages/rule-identity.njk)), made from the Markdown and the registry when the site is built:

- **For a rule in the working draft,** the page names the rule by its current number, says which section and heading it is under and any numbers it had before, shows the start of its text, and links to it ("Go to rule 12.4.1.c"). With JavaScript, [`assets/rule-forward.js`](assets/rule-forward.js) goes straight to the rule's block on its page (`…/12-service-requirements/#rule-r0254`), replacing the permanent link in the browser history so that Back works as expected. Without JavaScript the reader follows the link. GitHub Pages cannot redirect, so this is how the link reaches the rule.
- **Arriving at the rule,** the reader gets what a number anchor gives: the whole rule highlighted, its feedback link and copy buttons shown after it, and Tab reaching them.
- **For a retired rule,** the page says the rule has been removed, the number it had, and the rules that replace it, if any, with their permanent links. It never sends the reader anywhere on its own.

**Number anchors.** Every rule keeps its number anchor (`#section-12_4_1_c`), so links that use it keep working. When a rule has been renumbered, moved or retired, its old anchor is kept in a "Former rule numbers" list at the end of the page it was on, saying where the rule is now. A number on that page that a rule has now is never listed again, so no anchor is repeated. Where a number has been used for more than one rule:

- if a rule on the page has it now, the number anchor goes there, and the rule ends with a note naming the other rules that had the number on that page. The note is shown only to a reader who arrived through the number anchor (`.app-rule:target ~ .app-rule-reuse-note` in [`src/site.scss`](src/site.scss)), so it needs no JavaScript. A permanent link goes to the block's own anchor, so it does not show the note;
- otherwise the "Former rule numbers" entry lists every rule that had it, without choosing one.

The site check confirms that every rule has an identity on exactly one block, with the anchor made from it and a feedback reference to its permanent link. It also confirms that every identity in the registry has a page with the same status, that each current rule's page links to exactly that rule's block, and that a retired rule's page links to no rule.

## Changes to the trust framework

The "What's changed" page (`/changes/`) tells readers whether the trust framework has changed since its baseline, the tag named in [`framework-baseline.json`](../framework-baseline.json) (initially `published-1.0`). [`lib/changes.js`](lib/changes.js) works this out from Git when the site is built:

- Only the files in `trust-framework-1.0/` count. Their caution banner and "Repository navigation" footer are removed first, so changing those is not a change to the trust framework. Changes anywhere else in the repository are ignored.
- A file has changed only if it looks different on the site. Both versions are rendered as the site renders them. Whitespace a browser does not show, such as extra blank lines or double spaces, and HTML comments are ignored. Whitespace that matters, such as a hard line break or spacing inside code, still counts.
- The page compares the current working draft with the baseline, and says that changes in the working draft do not by themselves change the published trust framework. If nothing has changed, it says the working draft contains no changes compared with the baseline.
- If something has changed, the page lists the changed sections and the date the content last changed on `main`. Repository-only commits never change that date. Each changed section has a page showing the changed paragraphs and rule numbers linked to the rule. A removed rule's number links to its permanent link if exactly one rule had that number and no rule has it now:
  - **wording changes:** removed words struck through and added words underlined;
  - **link changes:** the link's old and new destination;
  - **formatting changes:** marked as formatting, with the wording and links the same.
- The changed section's own page links to its changes. Unchanged pages say nothing.
- Under a change, a "Why this changed" note gives the reasons a maintainer has recorded in [`change-provenance.json`](../change-provenance.json): an approved explanation, and links to the issues and pull requests on GitHub. An entry about a whole section is shown under the page summary. Nothing is shown for a change with no entry, and nothing is taken from GitHub. [`lib/change-provenance.js`](lib/change-provenance.js) matches entries to changed blocks by rule identity: by the rule's number now, and by its number in the baseline when exactly one rule has had that number in that file, so it never guesses. The note is [`_includes/components/change-provenance.njk`](_includes/components/change-provenance.njk). [ARCHITECTURE.md](../ARCHITECTURE.md#why-a-change-was-made) explains how maintainers record it.
- A file is "moved" only when it looks exactly the same in its new place.

The build needs the baseline tag and the full Git history. In CI, if either is missing, the build fails rather than saying nothing has changed. A local build without them says the information is not available. The tests check the comparison against small example repositories, and the site check confirms that what the page says is consistent.

## Header

The header is GOV.UK Frontend's Generic header (the OfDIA name) and Service navigation (the service name and five links). The service name is too long to share a row with the links, so from tablet width up the service name has its own row and the links sit in a row below it, aligned with it. This is set in [`src/site.scss`](src/site.scss); only the vertical padding is reduced, not text or touch target sizes. On narrow screens GOV.UK's own Menu button shows and hides the links; without JavaScript the links are always shown. The link for the page being read is marked `aria-current="page"` (for example Search on the search page), and the link for the part of the site it is in is marked `aria-current="true"` (Contents on a section page).

## Branding

The site is not part of GOV.UK. Following the GOV.UK Design System rules for services on other domains, it uses [GOV.UK Frontend](https://frontend.design-system.service.gov.uk/) components with:

- the Generic header, showing the OfDIA name instead of the GOV.UK logo;
- no crown, GOV.UK favicons or GDS Transport font (it uses Arial);
- black instead of the GOV.UK brand colour (set in [`src/site.scss`](src/site.scss)).

## Build and publish

The [Reading site workflow](../.github/workflows/site.yml) runs on every pull request and every change to `main`:

- On a pull request it checks the rule identities, builds the site, tests the rendering and checks every page. The checks cover internal links, form addresses and anchors, unique IDs, heading order, image alt text, the draft banner, an anchor and feedback route for every numbered rule, a permanent link page for every rule identity that goes to the right rule, a consistent "What's changed" page, a search index whose every entry links to an anchor that exists, a search page that offers another way to find a rule until search has started, a site navigation that marks the current page with `aria-current="page"`, existing feedback links that go to the right place with the right count, "Why this changed" notes that show exactly what `change-provenance.json` records, and a "Back to top" link on every page that works without JavaScript. Nothing is published.
- On `main` it does the same and then publishes the site to GitHub Pages.

Publishing needs GitHub Pages enabled for the repository, with **GitHub Actions** as the source (Settings, Pages).

## Run it locally

You need Node.js 24 (see [`.nvmrc`](.nvmrc)) and Python 3.

```sh
cd docs-site
npm ci
npm start          # build the stylesheet, then serve the site at http://localhost:8080/ and rebuild on changes
npm run rules      # check that every rule has its permanent identity (see ARCHITECTURE.md)
npm run feedback   # check existing-feedback.json; npm run feedback -- show/remove changes it (see ARCHITECTURE.md)
npm run provenance # check change-provenance.json; npm run provenance -- record/remove changes it (see ARCHITECTURE.md)
npm test           # test the Markdown rendering
npm run build      # build once into _site/
python3 ../tools/check_site.py _site
```

## Files

| Path | What it is |
| --- | --- |
| `eleventy.config.js` | Which files become pages, their addresses, and site-wide data |
| `lib/markdown.js` | How the Markdown is rendered |
| `lib/changes.js` | What has changed in the trust framework since its baseline, for the "What's changed" pages |
| `lib/feedback.js` | Feedback link addresses, and the rules listed in each page's rule picker |
| `lib/rule-identities.js` | Each rule's permanent identity: checking `rule-identities.json` against the Markdown, and where each identity is now |
| `lib/existing-feedback.js` | The existing feedback chosen for the site: checking `existing-feedback.json`, and which rules and sections it is about |
| `scripts/existing-feedback.js` | `npm run feedback`: check `existing-feedback.json`, and show or remove an issue |
| `scripts/existing-feedback-action.js` | Turns the form of the "Show existing feedback" workflow into one `npm run feedback` command |
| `lib/change-provenance.js` | Why changes were made: checking `change-provenance.json`, and which changed blocks each entry explains |
| `scripts/change-provenance.js` | `npm run provenance`: check `change-provenance.json`, and record or remove an entry |
| `scripts/rule-identities.js` | `npm run rules`: check and maintain `rule-identities.json` |
| `scripts/rule-identities-summary.js` | When the rule identity check fails in the Reading site workflow, writes the job summary: how to record the decision in GitHub or locally, then the check's output |
| `scripts/rule-identities-action.js` | Turns the form of the "Maintain rule identities" workflow into one `npm run rules` command, so maintainers can do the same in the browser |
| `lib/contents.js` | The "On this page" list |
| `lib/search.js` | The search index, made from the trust framework sections |
| `_includes/layouts/` | Page templates: `base.njk` for every page, `page.njk` for pages rendered from Markdown |
| `_data/site.js` | Site title, organisation and publication links, and part titles |
| `pages/index.njk` | The home page |
| `pages/changes.njk`, `pages/changes-section.njk` | The "What's changed" page, and a page for each changed section |
| `_includes/components/change-provenance.njk` | The "Why this changed" note on a changed section's page |
| `pages/search.njk`, `pages/search-index.njk` | The search page, and the search index it loads |
| `pages/rule-identity.njk` | The permanent link page for each rule (`/rules/r0254/`) |
| `pages/existing-feedback.njk`, `_includes/components/existing-feedback-list.njk` | The existing feedback page (`/existing-feedback/`), and its list |
| `_includes/components/search-form.njk` | The search form, used on the home page and the search page |
| `src/site.scss` | GOV.UK Frontend settings and the site's own styles |
| `assets/init.js` | Starts GOV.UK Frontend's JavaScript |
| `assets/back-to-top.js` | Fixes the "Back to top" link to the window once the reader has scrolled down |
| `assets/rule-actions.js` | Shows the feedback link and copy buttons for the rule in use, and adds copy buttons to the rule picker |
| `assets/rule-links.js` | What "Copy link" and "Copy reference" copy |
| `assets/rule-forward.js` | Takes a permanent link straight to the rule |
| `assets/rule-picker-filter.js`, `assets/rule-filter.js` | The rule picker's filter, and which rules match it |
| `assets/search-core.js`, `assets/search.js` | Search: finding rules and passages, and showing the results |
| `test/` | Tests for the Markdown rendering, rule anchors, rule identities, feedback links, rule links, the rule picker's filter, the "On this page" list, changes and search |
