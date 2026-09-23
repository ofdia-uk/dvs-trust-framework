# Reading site

The source for the reading website: <https://ofdia-uk.github.io/dvs-trust-framework/>.

The site shows the working draft of the trust framework to people who would rather not use GitHub. It is for reading only. Feedback, review and history stay on GitHub, and every page links back there.

## How it works

The site has no copy of the text. [Eleventy](https://www.11ty.dev/) renders the Markdown files in `trust-framework-1.0/` and `CONTRIBUTING.md` directly from the repository. Rendering never changes the source files. [`lib/markdown.js`](lib/markdown.js) turns the GitHub-oriented Markdown into web pages:

- It removes each file's caution banner and "Repository navigation" footer. Every page shows a "Draft" status banner instead.
- It uses the first heading as the page title, and keeps the other headings in order without skipping levels.
- It points links between Markdown files at the matching site pages. Links to other repository files go to GitHub.
- It uses the abbreviation definitions kept in a hidden comment in section 16 to explain abbreviations on hover. It renders the bold row headings in the section 15 table as table row headers. Both match GOV.UK.
- It applies GOV.UK Frontend styles.

The Markdown is never processed by a template engine, so nothing in the policy text can be interpreted as code.

## Branding

The site is not part of GOV.UK. Following the GOV.UK Design System rules for services on other domains, it uses [GOV.UK Frontend](https://frontend.design-system.service.gov.uk/) components with:

- the Generic header, showing the OfDIA name instead of the GOV.UK logo;
- no crown, GOV.UK favicons or GDS Transport font (it uses Arial);
- black instead of the GOV.UK brand colour (set in [`src/site.scss`](src/site.scss)).

## Build and publish

The [Reading site workflow](../.github/workflows/site.yml) runs on every pull request and every change to `main`:

- On a pull request it builds the site, tests the rendering and checks every page. The checks cover internal links and anchors, heading order, image alt text and the draft banner. Nothing is published.
- On `main` it does the same and then publishes the site to GitHub Pages.

Publishing needs GitHub Pages enabled for the repository, with **GitHub Actions** as the source (Settings, Pages).

## Run it locally

You need Node.js 24 (see [`.nvmrc`](.nvmrc)) and Python 3.

```sh
cd docs-site
npm ci
npm start          # build the stylesheet, then serve the site at http://localhost:8080/ and rebuild on changes
npm test           # test the Markdown rendering
npm run build      # build once into _site/
python3 ../tools/check_site.py _site
```

## Files

| Path | What it is |
| --- | --- |
| `eleventy.config.js` | Which files become pages, their addresses, and site-wide data |
| `lib/markdown.js` | How the Markdown is rendered |
| `_includes/layouts/` | Page templates: `base.njk` for every page, `page.njk` for pages rendered from Markdown |
| `_data/site.js` | Site title, organisation and publication links, and part titles |
| `pages/index.njk` | The home page |
| `src/site.scss` | GOV.UK Frontend settings and the site's own styles |
| `assets/init.js` | Starts GOV.UK Frontend's JavaScript |
| `test/` | Tests for the Markdown rendering |
