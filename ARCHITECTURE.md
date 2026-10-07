<!-- caution-banner:start (wording is kept in tools/caution-banner.md; edit it there) -->
> [!CAUTION]
> This is a working draft of the UK digital verification services trust framework, maintained for collaboration and review. It is not the formally published version and may differ from it. For the published trust framework, see [GOV.UK](https://www.gov.uk/government/publications/uk-digital-verification-services-trust-framework-1-0).
<!-- caution-banner:end -->

# How this repository works

A reference for OfDIA maintainers: how the repository is organised, what each part is for, and how to carry out routine tasks.

## GitHub, GOV.UK and who decides

| Stage | What it means |
| --- | --- |
| Issue | Feedback, a question or a proposal. Raising an issue does not mean OfDIA has accepted it. |
| Pull request | A proposed change, reviewed and discussed before a decision is made. |
| Merged into `main` | Accepted into the working draft. Not yet published and not in force. |
| `published-X.Y` tag | The text exactly as formally published. See [Versions](VERSIONS.md). |
| GOV.UK publication | The authoritative, formally published version. |

Automated checks support this process. They do not approve policy. Decisions about policy wording are made by the OfDIA policy owner through review.

## Policy wording and repository material

The repository holds two kinds of material, and they are changed differently.

- **Policy wording** is the numbered text in the section files under `trust-framework-1.0/`. It changes only through a reviewed pull request that records the authority for the change, such as a linked issue or an OfDIA decision. Keep policy changes in their own pull requests, separate from repository changes.
- **Repository material** is everything added to help people read, discuss and maintain the text: the caution banner, navigation footers, README files, templates, tools and workflows. It can be improved without a policy decision, as long as the meaning of the policy wording is unchanged.

If you cannot tell whether a change alters meaning, treat it as a policy change.

## Layout

| Path | What it holds |
| --- | --- |
| `trust-framework-1.0/` | The working draft: section 0, then one folder per part, one file per numbered section |
| `media/` | Figures used by the text, and the OfDIA banner image |
| `tools/` | The caution banner source and tools used by the checks, with their tests |
| `.github/` | Issue forms, pull request template, code owners and workflows |
| `docs-site/` | Source for the [reading site](https://ofdia-uk.github.io/dvs-trust-framework/), built from the Markdown and published from `main` |
| `framework-baseline.json` | The tag the reading site's "What's changed" page compares the trust framework with. See [The framework baseline](VERSIONS.md#the-framework-baseline). |
| `rule-identities.json` | The permanent identity of every rule, for permanent rule links. See [Rule identities](#rule-identities). |
| `existing-feedback.json` | The issues maintainers have chosen to show on the reading site, next to the rules and sections they are about. See [Existing feedback on the reading site](#existing-feedback-on-the-reading-site). |
| `change-provenance.json` | Why changes to the trust framework were made, where maintainers have chosen to show it on the "What's changed" pages: the issues, pull requests and an approved explanation. See [Why a change was made](#why-a-change-was-made). |

## How the text is structured

- Each numbered section is one Markdown file. Each part of the publication is a folder.
- Invisible HTML anchors such as `<a id="section-12_4"></a>` keep the anchor IDs used on GOV.UK, so cross-references work. A reference to another file is a relative link to that file and anchor.
- A numbered rule is a paragraph that starts with its number, such as `12.4.1.c.`. The reading site gives each one an anchor made from its number, such as `#section-12_4_1_c`, when it is built. These anchors are not in the Markdown, so do not add them by hand.
- Each rule also has a permanent identity, such as `r0254`, recorded in `rule-identities.json`, not in the Markdown. When you add, renumber, move or remove a rule, record it there. See [Rule identities](#rule-identities).
- The example boxes in the GOV.UK publication are shown as quoted blocks. The heading in each box is one level below the heading of the section it sits in.
- The abbreviation definitions from the GOV.UK publication (`*[DVS]: Digital Verification Service`) are kept unchanged in an HTML comment at the end of section 16. GitHub does not display them. The reading site uses them to explain abbreviations, as GOV.UK does. Keep the comment, and add any new definition inside it.
- The row headings in the section 15 table are bold cells. On GOV.UK and the reading site they are table row headers.
- The navigation links at the end of each section file, below a horizontal rule, are repository material.
- The text was converted from the GOV.UK publication once, when it was first imported. The conversion scripts were removed afterwards. They remain in the repository history at commit `4c41d4f`.

## Caution banner

Each applicable Markdown file starts with a banner saying that the repository is a working draft and that GOV.UK holds the published version. The banner must stay visible to anyone who opens a single file on GitHub.

The wording is kept in one place, [`tools/caution-banner.md`](tools/caution-banner.md). In each file it sits between two HTML comments that GitHub does not display:

```markdown
<!-- caution-banner:start (wording is kept in tools/caution-banner.md; edit it there) -->
> [!CAUTION]
> This is a working draft of ...
<!-- caution-banner:end -->
```

To change the wording:

1. On a new branch, edit `tools/caution-banner.md`.
2. Apply it in one of two ways:
   - in a local copy, run `python tools/caution_banner.py --apply`, or
   - in the browser, go to **Actions**, choose **Apply caution banner**, and run it on your branch.
3. Open a pull request and review the changes. Every file's banner changes, and nothing else should.

The tool changes only the lines between the markers. It also adds the banner to a file that clearly has none. For anything unexpected it changes nothing and reports the file. That includes a banner without markers, text directly under the banner, duplicate or damaged markers, a byte order mark or front matter. Fix those files by hand. This is deliberate: the tool never guesses where the banner ends and the policy text begins.

Files under `.github/`, `tools/` and `docs-site/` do not need the banner.

## Automated checks

The **Repository checks** workflow runs on every pull request and every change to `main`. It uses read-only permissions and needs no secrets, so it also runs on pull requests from forks. It has no path filters, so if a check is made required it never waits in a "Pending" state.

| Check | Confirms | Does not confirm |
| --- | --- | --- |
| Caution banner present | Every applicable Markdown file starts with the current banner | Anything about the policy content |
| Tooling tests | The tools in `tools/` behave as their tests describe | Anything about the policy content |
| Internal links and anchors | Relative links and anchors in Markdown files resolve, and every issue form lists the same sections as the contents page | That external websites are reachable, or anything about the policy content |

The **Reading site** workflow also runs on every pull request and every change to `main`:

| Check | Confirms | Does not confirm |
| --- | --- | --- |
| Build and check the site | Every rule has exactly one permanent identity in `rule-identities.json`, and the registry agrees with the Markdown. Every entry in `existing-feedback.json` is valid and names rules and sections in the working draft. Every entry in `change-provenance.json` is valid and, for the current baseline, explains a rule or section that has changed since it. The site builds and its tests pass. Every page has working internal links and anchors, unique IDs, ordered headings, image alt text and the draft banner. Every numbered rule has an anchor and a feedback route, and every permanent rule link goes to its rule or, for a retired rule, to a page that says so. Links to existing feedback go to the right place and give the right count. The "What's changed" page reports a consistent status, and shows exactly the recorded reasons for changes. Every passage in the search index links to an anchor that exists, the search page offers another way to find a rule until search has started, and the site navigation marks the current page | That the site is published, or anything about the policy content |

On a pull request, GitHub runs the workflows and tools as changed by that pull request. A passing check therefore does not show that the checks themselves were left intact. Review changes to `.github/` and `tools/` with that in mind.

## Reading site

The [reading site](https://ofdia-uk.github.io/dvs-trust-framework/) shows the working draft to people who would rather not use GitHub. It renders the Markdown files directly and keeps no copy of the text. Changes to `main` are published automatically. Pull requests are built and checked but never published. The site is not part of GOV.UK, so it uses the GOV.UK Design System's Generic header and none of the GOV.UK branding. [`docs-site/README.md`](docs-site/README.md) explains how it works and how to run it.

Besides the text itself, the site generates four things when it is built:

- **Rule-level feedback, links and references.** Readers can give feedback on a specific rule by pointing to or tapping it, or with the rule picker at the bottom of the page, which can be filtered by rule number or heading. Either way, an issue form opens with the rule number and a link to the rule filled in. The page-level "Give feedback on GitHub" link remains the general route, and the "Draft" banner at the top of every page offers the same route ("give feedback on this draft") without scrolling. The same places offer "Copy link", which copies the rule's permanent link, and "Copy reference" (for example `Rule 12.4.1.c`). A link to a rule highlights the whole rule. See [Rule identities](#rule-identities).
- **Search (`/search/`).** Readers can search for words, or type a rule or section number such as 12.4.1.c to go straight to it. The search index is made from the trust framework Markdown, so it never needs updating by hand. Search needs JavaScript; if it cannot run, the page explains how to find a rule and links to every section.
- **"What's changed" (`/changes/`).** The page compares the working draft with the configured baseline and shows any changes to the trust framework content. Where a maintainer has recorded why a change was made, it says so under the change. See [Trust framework changes and repository history](#trust-framework-changes-and-repository-history) and [Why a change was made](#why-a-change-was-made).
- **Existing feedback (`/existing-feedback/`).** Issues that maintainers have chosen to show, listed by section and rule, with links from those rules and sections. See [Existing feedback on the reading site](#existing-feedback-on-the-reading-site).

## Rule identities

A rule's number, such as 12.4.1.c, tells readers where it is, but numbers change: a rule can be renumbered, moved to another section, removed, split or merged. So each rule also has a **permanent identity**, such as `r0254`, that never changes and is never reused. The reading site gives each identity a **permanent link**, `/rules/r0254/`, which goes to wherever that rule is in the working draft. "Copy link" and the links in new feedback issues use it. People still see and cite the rule's current number: "Rule 12.4.1.c".

The identities are recorded in [`rule-identities.json`](rule-identities.json), one rule per line. They are never worked out from the number, the wording or the position, and the build never changes them. The Markdown is not changed to hold them.

| Field | Meaning |
| --- | --- |
| `id` | The permanent identity: `r` and at least four digits. Never changed or reused. New ones are added at the end. |
| `number`, `file` | Where a rule in the working draft is now: its number and section file. |
| `fingerprint` | A short hash of the rule's wording, without its number, as last confirmed. See [Checks](#checks). |
| `history` | Every earlier number and file the rule had, oldest first. |
| `status` | `"retired"` for a rule that has been removed. Left out for a rule in the working draft. |
| `replacedBy` | For a retired rule, the identities of any rules that replace it. |
| `reusedNumbers` | Every number that has been used for more than one identity, with those identities. |

### Checks

The Reading site workflow runs `npm run rules` (in `docs-site/`) before building, and the build runs the same check. It fails, and says what to decide, if:

- a rule has no identity, or an identity's rule is missing from the Markdown;
- an identity is repeated, out of order or malformed;
- a rule is not in the file its entry says;
- a rule's wording no longer matches its fingerprint;
- a number has been used for more than one identity and that has not been acknowledged in `reusedNumbers`.

When the check fails in the Reading site workflow, the step shows an error, **Rule identity decision required**. The run's summary page explains how to record the decision in GitHub, with a link to the Maintain rule identities workflow, or on a computer. Below that is the command's own output, which says exactly what needs deciding.

The **fingerprint** is a guardrail, not the identity. Nothing matches rules by their wording. Its job is to catch wording that has moved to another number. For example, if a rule is inserted as 12.4.1.c and the rules after it become 12.4.1.d, e and f, the old identities would otherwise quietly follow the numbers to the wrong rules. When a rule's wording legitimately changes, a maintainer confirms it and the identity stays the same. The check may mention that a rule's wording matches another identity's, as a hint only: deciding whether two rules are the same is an editorial decision, and no tool makes it. Such a match does stop wording being confirmed in bulk, because a swap of two rules' numbers looks like nothing more than changed wording.

The fingerprint is made from the rule's text as the site reads it. If a change to the site's Markdown rendering changes that text for many rules at once, every affected rule fails the check, and its wording must be confirmed again in that pull request.

### Maintaining the identities

Make these changes in the same pull request as the Markdown change. There are two ways to make them, and they do exactly the same thing:

- **In GitHub, in the browser:** run the **Maintain rule identities** workflow on the pull request's branch. No terminal is needed. See [Working entirely in GitHub](#working-entirely-in-github).
- **On your own computer:** run `npm run rules` in `docs-site/`, as in the table below.

Either way, review the change to `rule-identities.json` in the pull request like any other change. You can also edit `rule-identities.json` by hand, using the lines the failed check prints, but the workflow and the command check each decision for you.

| You have… | Do this |
| --- | --- |
| Added a genuinely new rule | `npm run rules -- add 12.4.1.g` gives it the next identity. |
| Changed a rule's wording | `npm run rules -- confirm r0254`. If many rules were reworded and nothing else changed, `npm run rules -- confirm --all-changed`. That refuses if anything else is wrong, such as a rule without an identity, or if any rule's wording is now another rule's confirmed wording, as when rules swap numbers. In either case some wording may have moved to a different number, so decide about those rules one at a time: `renumber` them if they moved, or `confirm` them by name if they did not. |
| Renumbered a rule, or moved it to another section | `npm run rules -- renumber r0254=12.4.1.d`. Give several at once when rules shift together: `renumber r0256=12.4.1.f r0255=12.4.1.e r0254=12.4.1.d`. The old number and file are added to its `history`. |
| Removed a rule | `npm run rules -- retire r0254`. Its permanent link keeps working and says it has been removed. |
| Replaced a rule with a different one | `npm run rules -- retire r0254`, then `add` the new rule, then `npm run rules -- retire r0254 --replaced-by r0340` to record what replaces it. Retire first: if the new rule has the old one's number, `add` refuses while the old identity still holds it. |
| Split a rule | Decide whether one part is still the same rule. If so, keep its identity (confirm its wording) and `add` the other parts as new rules. If not, `retire` the old one, `add` all the parts as new rules, then `retire` it again `--replaced-by` all of them. |
| Merged rules | Decide whether the merged rule is one of the old ones. If so, keep that identity and retire the others `--replaced-by` it. If not, add it as a new rule and retire all the old ones `--replaced-by` it. |
| Reused a number another rule used to have | Check that this is intended, then `npm run rules -- reuse 12.4.1.c`. The check asks for this whenever a number has been used for more than one rule, including the numbers that shift when a rule is inserted. |

Never edit an `id`, reuse one, or delete an entry. A permanent identity always means the same rule. If an identity was registered by mistake, for example a renumbered rule was added as new, retire the mistaken identity `--replaced-by` the right one, and record the rule's new number on the right one.

The command exits with status 0 if the registry then matches the trust framework, 1 if the change was made but other decisions are still needed, and 2 if it refused and changed nothing.

### Working entirely in GitHub

Every identity decision can be made in GitHub in the browser, in the same pull request as the wording change, without a terminal. The **Maintain rule identities** workflow ([`.github/workflows/maintain-rule-identities.yml`](.github/workflows/maintain-rule-identities.yml)) runs one of the commands above on your branch. It commits the updated `rule-identities.json` to that branch, then runs the checks again.

**Running it.** You need write access to the repository, and your branch must be in this repository (a workflow runs in the repository that holds the branch).

1. Go to **Actions**, choose **Maintain rule identities**, then **Run workflow**.
2. Under **Use workflow from**, choose your pull request's branch. The workflow refuses to run on `main` or on a tag.
3. Choose the **operation**, and type the rules it is for in **arguments**, separated by spaces.
4. Choose **Run workflow**. Open the run when it appears. Its summary shows the command it ran and everything the command said.

| Operation | Arguments | Runs |
| --- | --- | --- |
| check only (change nothing) | none | `npm run rules -- check` |
| confirm wording (IDs) | identities, such as `r0254 r0255` | `npm run rules -- confirm r0254 r0255` |
| confirm ALL changed wording | none | `npm run rules -- confirm --all-changed` |
| add new rules (numbers) | rule numbers, such as `12.4.1.g` | `npm run rules -- add 12.4.1.g` |
| renumber or move (ID=number) | identity=number pairs, such as `r0254=12.4.1.d` | `npm run rules -- renumber r0254=12.4.1.d` |
| retire (IDs) | identities, plus any replacements in **replaced by** | `npm run rules -- retire r0254 --replaced-by r0340` |
| acknowledge reused numbers (numbers) | rule numbers, such as `12.4.1.c` | `npm run rules -- reuse 12.4.1.c` |

**What happens.**

- **Recorded.** `github-actions[bot]` commits `rule-identities.json` to your branch, with a message such as "Record rule identity decision: confirm r0254", and starts the Reading site and Repository checks on that commit. Commits made by a workflow do not start other workflows by themselves, which is why it starts them. If other decisions are still needed, the run says so: make the next one and run the workflow again.
- **Refused.** The run fails and nothing is committed. The command's reasons are in the summary. This happens for the same reasons as on a computer. For example, `confirm ALL changed wording` refuses when any rule's wording is now another rule's confirmed wording, as when rules swap numbers.
- **Nothing to change.** If the registry already records the decision, the run says so and commits nothing.

**Safeguards.** The workflow is only a form in front of the commands above, and makes no decision itself.

- It accepts only identities, rule numbers and identity=number pairs, so what you type can never become anything but arguments to the operation you chose.
- `confirm ALL changed wording` runs only when you choose it, and takes no arguments.
- It commits only `rule-identities.json`, never the trust framework text. If anything else changed, it fails without committing.
- It pushes only to the branch it was run on, and never forces. If the branch has moved on since the run started, the push fails: run it again.
- It uses no secrets, and only two permissions: to commit to the branch, and to start the checks.

#### Example: a reworded rule

Rule 12.4.1.c (`r0254`) is reworded.

1. On a branch, edit `trust-framework-1.0/part-3/12-service-requirements.md` in GitHub and change the wording of 12.4.1.c. Commit the change.
2. Open a draft pull request for the branch.
3. The Reading site check fails at **Check rule identities**. It says that the wording of rule 12.4.1.c, registered as `r0254`, has changed since it was last confirmed.
4. Decide whether 12.4.1.c is still the same logical rule: the same requirement, reworded. This is an editorial judgement, not a matter of how many words changed.
5. If it is, run **Maintain rule identities** on the branch, with **confirm wording (IDs)** and arguments `r0254`.
6. The workflow updates `r0254`'s fingerprint in `rule-identities.json` and commits it to the branch.
7. The checks run again on the new commit, and pass.
8. Reviewers see the wording change and the identity decision together in the pull request's **Files changed**: the Markdown, and the one changed line for `r0254` in `rule-identities.json`.
9. Merging the pull request accepts the new wording into the working draft, and records that it is still rule `r0254`. Links and feedback that use `/rules/r0254/` keep going to it.

Confirming does not approve the wording. It records the maintainer's judgement that the rule is still the same rule. Review and merging the pull request remain how a change is accepted, as for any other change. If it is no longer the same logical rule, do not confirm it. Instead, record what happened: `retire` the old identity, `add` the new rule, and record what replaces what, as in the examples below. Identities are never edited or reused.

#### Other examples

Each step is one run of the workflow on the pull request's branch, after the wording change has been committed there.

- **A genuinely new rule,** 12.4.1.g: **add new rules (numbers)** with `12.4.1.g`. It gets the next identity, such as `r0338`.
- **A renumbered or moved rule:** if 12.4.1.c becomes 12.4.1.d, or moves to section 11 as 11.2.e, use **renumber or move (ID=number)** with `r0254=12.4.1.d` or `r0254=11.2.e`. When an inserted rule shifts several, give them all in one run: `r0256=12.4.1.f r0255=12.4.1.e r0254=12.4.1.d`. Then add the inserted rule (**add new rules**), and acknowledge the numbers that now belong to different rules (**acknowledge reused numbers**). The check lists them.
- **A removed rule:** **retire (IDs)** with `r0254`. Its permanent link keeps working and says it has been removed.
- **A replacement or a split** where the old rule is not kept: first **retire (IDs)** with `r0254`. Then **add new rules (numbers)** with the new rules' numbers, such as `12.4.1.c 12.4.1.h`. Then **retire (IDs)** again with `r0254`, and the new identities in **replaced by**, such as `r0338 r0339`. If a new rule reuses the old rule's number, acknowledge that number too.
- **A reused number:** after checking that it is intended, **acknowledge reused numbers (numbers)** with the number, such as `12.4.1.c`.

### Links that use numbers

Links that use a rule's number, such as `.../12-service-requirements/#section-12_4_1_c`, keep working: every rule keeps its number anchor. When a rule is renumbered, moved or retired, its old anchor stays on the page it was on, in a "Former rule numbers" list at the end of that section. The entry says what the rule is now, or that it has been removed, so an older link still lands somewhere that explains it. Searching for an old number does the same.

A number link cannot say which rule it meant if the number has been used for more than one rule. The site does not choose:

- if a rule on that page has the number now, the link goes to it, as it always has, but that rule then shows a note naming the other rules that had the number on that page;
- if no rule has it now, the "Former rule numbers" entry lists every rule that had it;
- search lists every rule that has had the number.

A permanent link never has this problem, which is why "Copy link" uses it. The note is shown only to readers who arrive through the number anchor. If a whole section file is renamed or removed, links to its old page address stop working. Recording the move keeps the rule's permanent link working, but not the old page address.

## Existing feedback on the reading site

Readers can see feedback that has already been raised about a rule or section, so they can add to it rather than raise it again. A rule with feedback shows "See existing feedback on 12.4.1.c (3)" next to "Give feedback on 12.4.1.c", and its section shows "See existing feedback about this section (4)" at the bottom. Both go to the [existing feedback page](https://ofdia-uk.github.io/dvs-trust-framework/existing-feedback/), which lists each issue by its title, with a link to it on GitHub. Rules and sections with none show nothing.

Being public on GitHub does not put an issue on the site. Only the issues listed in [`existing-feedback.json`](existing-feedback.json) are shown, and that file changes only through a reviewed pull request. Listing an issue means it is useful for readers to find. It does not mean that OfDIA agrees with it, and the site says so.

### Showing an issue

Before showing an issue, check that it is suitable to point readers to. The site shows only a short title and a link to the issue, never the issue's own text.

**In GitHub, in the browser** (you need write access to the repository):

1. Go to **Actions**, choose **Show existing feedback**, then **Run workflow**. Leave **Use workflow from** as `main`.
2. Fill in the form:
   - **action:** show an issue;
   - **issue:** its number, such as `6`;
   - **title:** a short, neutral title for readers, such as `What "registration" means in rule 12.4.1.c`. Leave it empty to use the issue's own title;
   - **rules:** the rule numbers it is about, as you read them on the site, such as `12.4.1.c 11.2.b`;
   - **sections:** the numbers of any sections it is about as a whole, such as `12`.
3. Choose **Run workflow**. Open the run when it appears.

The workflow looks up each rule's permanent identity, adds the issue to `existing-feedback.json` on a new branch and opens a pull request. Its summary says what it did. Review the pull request, in particular the title readers will see, and merge it. Nothing is shown on the site until it is merged.

If anything is wrong, the run fails and commits nothing. That happens, for example, when the issue does not exist, a rule number is not in the working draft or the title is too long. The summary says why.

Running it again for an issue that is already shown changes only what you fill in, such as its title or its rules. To add several issues in one pull request, run it once from `main`, then run it again choosing the new branch under **Use workflow from**: it then adds to that branch.

**On your own computer:** run, in `docs-site/`:

```sh
npm run feedback -- show 6 --title "What registration means in rule 12.4.1.c" --rules 12.4.1.c --sections 12
```

Then commit `existing-feedback.json` and open a pull request.

**By hand:** you can also edit `existing-feedback.json` directly. Each issue is one line:

```json
{"issue":6,"title":"What registration means in rule 12.4.1.c","rules":["r0254"],"sections":["trust-framework-1.0/part-3/12-service-requirements.md"]}
```

| Field | Meaning |
| --- | --- |
| `issue` | The issue's number on GitHub. List each issue once. |
| `title` | A short, neutral title for readers, written by a maintainer, on one line and at most 150 characters. The site shows only this and a link to the issue, never the issue's own text, so check that the issue is suitable to point readers to. |
| `rules` | The permanent identities of the rules it is about, such as `r0254`, not their numbers. "Copy link" on a rule gives its permanent link, `/rules/r0254/`, which contains the identity. |
| `sections` | Section files it is about as a whole, such as `trust-framework-1.0/part-3/12-service-requirements.md`. |

An entry needs `rules`, `sections` or both. An issue about several rules is shown on each one.

### When rules move, are renumbered or are removed

Entries name rules by their permanent identity, so when a rule is renumbered or moved to another section, and that is recorded in `rule-identities.json`, its feedback goes with it and `existing-feedback.json` does not change. When a rule is removed (retired), the check fails and names any rules that replace it. In the same pull request, either list the replacements instead, or remove the identity from the entry. If a section file is renamed or removed, update or remove it in `sections` in the same way.

### Checks

The Reading site workflow runs `npm run feedback` (in `docs-site/`), and the build runs the same check. It fails, saying what to change, if `existing-feedback.json`:

- cannot be read, or has unexpected fields;
- lists an issue twice;
- has a title that is missing, on more than one line or too long;
- gives a rule number instead of an identity (it names the identity to use);
- names an identity that does not exist, or a rule that has been removed;
- names a section file that does not exist.

When the check fails, nothing is published, and the live site keeps its last version. The site check also confirms that each count matches the existing feedback page and that every link goes where it should.

### Removing an issue from the site

Run **Show existing feedback** with **stop showing an issue** and the issue number, or `npm run feedback -- remove 6`. You can also delete its line from `existing-feedback.json` by hand. Merge the pull request, and the site no longer shows it. The issue on GitHub is not changed: it stays open or closed, with its discussion, as before.

To stop showing it on one rule only, run **show an issue** again for it with the rules it should still be shown on.

### The workflow's safeguards

The **Show existing feedback** workflow ([`.github/workflows/show-existing-feedback.yml`](.github/workflows/show-existing-feedback.yml)) is only a form in front of `npm run feedback`, and decides nothing itself.

- It accepts only an issue number, a one-line title, rule numbers and section numbers, so what you type can never become anything but arguments to the command.
- It checks that the issue exists and is not a pull request.
- It commits only `existing-feedback.json`. If anything else changed, it fails without committing.
- It never commits to `main`. Run from `main`, it makes a new branch and a pull request; run from another branch, it commits to that branch. It never forces a push.
- It uses no secrets. Its permissions let it commit to a branch, open the pull request, read the issue and start the checks.

If the repository does not allow workflows to open pull requests, the run gives a link to open it yourself.

## Trust framework changes and repository history

These are kept separate.

- **Repository history** is everything in Git: changes to the text, and to the website, issue forms, workflows and tools. The GitHub commit history and comparison views show all of it. Nothing is hidden or rewritten.
- **Trust framework changes** are changes to the content of the files under `trust-framework-1.0/`: their wording, links and formatting. The site's "What's changed" page shows only these. It compares the working draft with the tag named in [`framework-baseline.json`](framework-baseline.json), currently `published-1.0`. The caution banner, the navigation footer and whitespace that does not change how the text looks do not count.

Repository-only work never needs a tag. Changing the baseline is a deliberate decision, made in a reviewed pull request. [Versions](VERSIONS.md#the-framework-baseline) explains when.

To compare, the site build needs the baseline tag and the full Git history, which the Reading site workflow fetches. The build fails rather than saying nothing has changed in any of these cases:

- the tag is missing;
- the tag is not an annotated tag;
- the tag is not in the history of `main`;
- the history is incomplete.

A fork needs the baseline tag too. Forks do not receive new tags automatically, so after the baseline moves, fetch the tag into the fork.

## Why a change was made

The "What's changed" pages show *what* differs between the working draft and the baseline. Where a maintainer has recorded it, a change can also say *why*: a short explanation, if one has been approved, and links to the issues where it was raised and the pull requests where it was reviewed and accepted.

Recording this is optional and deliberate. Nothing is worked out from commit messages, pull request descriptions, linked issues or discussion on GitHub. The site shows only what is recorded in [`change-provenance.json`](change-provenance.json), which changes only through a reviewed pull request. A change with no entry shows nothing.

An entry records why a *change* was made: a change to a rule or section since the baseline. It is not a place for general comments about a rule. For feedback about a rule, see [Existing feedback on the reading site](#existing-feedback-on-the-reading-site).

### What readers see

On the section's "What's changed" page, under the change, readers see:

> **Why this changed**
> Makes clear that fraud audits are needed every six months.
> Raised in issue #123 on GitHub.
> Reviewed and accepted in pull request #147 on GitHub.

An entry about a section as a whole is shown under the page's summary, as "Why this section changed". It is set in smaller text than the change, so the framework wording stays the main thing on the page. Each number links to the issue or pull request on GitHub. Nothing else is copied from GitHub to the site: not the issue's title, text, comments or labels.

### What is public where

| Where | What is there |
| --- | --- |
| The reading site | Only the entries in `change-provenance.json` for the current baseline: the approved explanation, and links to the issues and pull requests it names. |
| GitHub | Everything: every issue and pull request with its discussion, the commit history, and `change-provenance.json` itself with its history, including entries that are no longer shown. |

An issue or pull request being public on GitHub, or being linked from a commit or another pull request, never puts it on the site.

### Recording why a change was made

Record it in the pull request that makes the change, once its number is known: open the pull request as a draft first. You can also record it in a later pull request after the change has merged. Record the rule identity decisions first (see [Rule identities](#rule-identities)), because entries name rules by their identity.

**On your own computer,** run, in `docs-site/`:

```sh
npm run provenance -- record --rules 12.4.1.c --issues 123 --pr 147 --rationale "Makes clear that fraud audits are needed every six months."
```

| Option | Give |
| --- | --- |
| `--rules` | The rules whose change it explains. Use their number as you read it on the site now, such as `12.4.1.c`, or their permanent identity, such as `r0254`. For a removed rule, use the number it last had, or its identity. |
| `--sections` | The sections whose change it explains as a whole, by number (`12`) or file. Use this for a change that is not to a numbered rule, such as a heading, an introductory paragraph or a table, or for a section file that was added, removed or moved. |
| `--issues` | The issues that raised the change, as `123`, `#123` or the issue's address. |
| `--pr` | The pull requests that reviewed and accepted it, in the same forms. |
| `--rationale` | Optional. A short explanation for readers, on one line, of at most 400 characters, approved for publication. It is shown exactly as written, as plain text: Markdown and HTML are not formatted. Leave it out if the links say enough. |

An entry needs `--rules` or `--sections`, and at least one of `--issues`, `--pr` and `--rationale`.

The command:

- records the entry against the current baseline;
- gives it the next id, such as `c0001`;
- records rules by their permanent identity;
- refuses anything that would fail the checks below.

Commit `change-provenance.json`, and review it like any other change. Check in particular the explanation readers will see, and that each number is the right issue or pull request.

**In GitHub, in the browser,** edit `change-provenance.json` on the pull request's branch and add a line, as below. The checks on the pull request say if anything is wrong.

**The file** has one entry per line:

```json
{"id":"c0001","baseline":"published-1.0","rules":["r0254"],"issues":[123],"pullRequests":[147],"rationale":"Makes clear that fraud audits are needed every six months."}
```

| Field | Meaning |
| --- | --- |
| `id` | `c` and at least four digits, unique in the file. Use the next number. |
| `baseline` | The baseline the change was made against: the `tag` in [`framework-baseline.json`](framework-baseline.json), currently `published-1.0`. |
| `rules` | The permanent identities of the rules whose change it explains, such as `r0254`, never their numbers. "Copy link" on a rule gives its permanent link, `/rules/r0254/`, which contains the identity. A removed rule's identity is on its permanent page. |
| `sections` | Section files whose change it explains as a whole, such as `trust-framework-1.0/part-3/12-service-requirements.md`. |
| `issues`, `pullRequests` | Issue and pull request numbers, as plain numbers: `[123, 130]`, not `"#123"` and not addresses. |
| `rationale` | Optional. The approved explanation, as above. |

**Which entries to make:**

- **Several issues led to one change:** list them all in one entry.
- **One issue led to changes to several rules:** list the rules in one entry. If they need different explanations, make one entry for each.
- **A rule was changed by several pull requests since the baseline:** make one entry for each pull request. The page shows the whole change since the baseline, so it shows them all, in the order of the file (oldest first).

### When rules are renumbered or moved

Entries name rules by their permanent identity. When a rule is renumbered or moved, and that is recorded in `rule-identities.json`, its entry needs no change. The entry follows the rule: it is shown under the rule's new number. For a rule moved to another section, it is shown on both sections' pages, where it was removed and where it was added.

If a number has been used for more than one rule, the site may not be able to tell which rule a passage removed from that number belonged to. Rather than guess, it then shows nothing for that passage. If that leaves an entry shown nowhere, the check fails. List the section in `sections` instead.

### When a later change replaces an earlier one

If a rule is changed again by a later pull request, add an entry for the later change. Both are shown.

If the later change makes the earlier explanation wrong, update or remove the earlier entry in the same pull request. For example, if the earlier wording has been replaced entirely:

- to remove the rule from the earlier entry, run `npm run provenance -- record c0001 --rules` with the rules it still explains;
- or remove the whole entry.

If a change is undone, so that a rule is back to its baseline wording, the check fails until the rule is removed from its entries.

### When the baseline moves

Entries belong to the baseline they were made against. When [`framework-baseline.json`](framework-baseline.json) names a new baseline, the "What's changed" pages compare the working draft with it, and entries for the old baseline are no longer shown. They stay in the file as a record. They are no longer checked against the comparison, but their baseline tag must still exist. New entries are recorded against the new baseline.

### Correcting or withdrawing an entry

- **To correct an entry,** run `npm run provenance -- record c0003` with only what changes, such as `--rationale "A corrected explanation."` or `--issues 123 130`. Everything else is kept. `--rationale ""` removes the explanation.
- **To stop showing an entry,** run `npm run provenance -- remove c0003`.
- **To stop showing one issue or pull request but keep the rest,** record the entry again with the list it should keep.

You can also edit or delete the entry's line by hand. Once the pull request is merged, the site changes.

Issues and pull requests on GitHub are not changed by any of this. They stay public, with their discussion, whatever the site shows. The history of `change-provenance.json` records what was shown, and when.

### Checks

The Reading site workflow runs `npm run provenance` (in `docs-site/`), and the build runs the same check. It needs the baseline tag and the full Git history, as "What's changed" does. It fails, saying what to change, if `change-provenance.json`:

- cannot be read, or has unexpected fields;
- has an `id` that is missing, malformed or used twice;
- has no `baseline`, or, for an earlier baseline, names a tag that does not exist;
- has an entry that does not say what changed (no rules or sections) or why (no issues, pull requests or explanation);
- gives a rule number instead of an identity (it names the identity to use), or names an identity that does not exist;
- gives an issue or pull request as anything but a plain number (for `"#123"` or an address, it says the number to write);
- gives the same number as both an issue and a pull request;
- has an explanation that is empty, on more than one line or too long;
- names a rule or section that has not changed since the current baseline. This includes a change that has been undone, and a rule whose only change is that its section file moved: list the section instead;
- explains the same rule or section twice with the same pull request, or, without a pull request, with the same issue.

The checks cannot tell whether #123 really is the issue that raised the change, whether #147 was merged, or whether the explanation is accurate and approved. Reviewers check these.

When the check fails, nothing is published, and the live site keeps its last version. The site check also confirms that the notes appear only on "What's changed" pages, and that each entry for the current baseline is shown with exactly its explanation, issues and pull requests, as text. Each issue and pull request link must go to that issue or pull request on GitHub.

The command exits with status 0 if the register is in order, 1 if it has problems, and 2 if it refused a change, or could not read the register, the rule identities or the comparison with the baseline. When it refuses, it changes nothing.

## Issue labels

The issue forms apply these labels. They must exist in the repository for the forms to label issues.

| Label | Applied by |
| --- | --- |
| `triage` | Every issue form, until a maintainer has reviewed the issue |
| `proposed change` | Policy feedback |
| `draft clarity` | Unclear wording |
| `correction` | Correction, and Broken link or navigation problem |
| `accessibility` | Accessibility problem |
| `suggestion` | Other suggestion |

Maintainers add other labels when they triage an issue, such as the `area:` and `theme:` labels.

Every issue form has an optional "Rule, paragraph or page" field (`id: reference`). The reading site's feedback links fill it in, through GitHub's template chooser, with a link to the rule or page. Keep the field, with that ID, in every form.
