#!/usr/bin/env python3
"""Check the built reading site for broken links and basic structural problems.

Run after building the site:
    python tools/check_site.py docs-site/_site

For every HTML page it checks that:

- each internal link, form address and #anchor points to a page and element
  that exist;
- no two elements on a page share an id;
- every numbered rule has an anchor made from its number and a feedback
  route: it sits in a rule block whose feedback reference is the rule
  number and a link to the rule's permanent address, and it is in the
  page's rule picker;
- exactly one page (/changes/) says whether the trust framework wording has
  changed since its baseline, and what it says is consistent: "unchanged"
  lists no changed sections and no section page says it has changed;
  "changed" lists as many sections as it says;
- the page has a language, a title and exactly one <h1>, and its heading
  levels do not skip (for example from <h2> straight to <h4>);
- every image has an alt attribute;
- the draft status banner is present, with a link to give feedback: on a
  trust framework page it fills in that page as the "Rule, paragraph or
  page", and on any other page it fills in nothing;
- in the site navigation, at most one link is marked as current, and a link
  to the page itself is marked aria-current="page";
- there is one "Back to top" link, saying so in words, to an element on the
  page with the id "top", and it is shown as built, so it works without
  JavaScript;
- no repository-only material (the caution banner markers or the
  "Repository navigation" footer) has leaked into the page.

It checks every rule's permanent address (/rules/<identity>/, see
docs-site/lib/rule-identities.js): each rule block has a permanent identity
and an anchor made from it (#rule-r0123); no identity is on more than one
block; each identity has a page; a current rule's page links to exactly that
rule's block, and a retired rule's page links to no rule but to the pages of
any rules that replace it; and the pages are exactly the identities in
rule-identities.json, with the same status.

It checks the existing feedback that maintainers have chosen to show
(docs-site/lib/existing-feedback.js): a rule block that says it has some
links, relative to the site root, to its own place on the existing feedback
page (existing-feedback/#rule-r0123), which lists as many issues as the
block says; a section's "See existing feedback about this section" link
goes to that section's place on the page and gives the same count; every
rule and section listed on the page is linked to from the site; and every
issue link goes to that issue on GitHub. With nothing listed, no rule or
section links there.

It checks why changes were made, where maintainers have recorded it
(docs-site/lib/change-provenance.js): a "Why this changed" note appears only
on a section's "What's changed" page (changes/<slug>/); each issue and pull
request link goes to that issue or pull request on GitHub and says which it
is; and, compared with change-provenance.json, every entry for the current
baseline is shown somewhere, nothing else is, and each shows exactly its
explanation, issues and pull requests, as text.

It also checks the search index (search-index.json): every passage in it
links to a page and anchor that exist, page addresses are relative to the
site root (so they work under a path prefix), rule and section numbers are
not repeated, every rule has its permanent identity, every identity in it
has a page, and it holds none of the site's navigation, banners or
feedback controls. On the search page as built, before any script runs, the
search results area is hidden and the other way to find a rule (the
fallback, with links to the sections) is shown, so readers have it without
JavaScript or if the search scripts do not load.

External links are not checked.

Pass --path-prefix if the site was built for a sub-path, for example
--path-prefix /dvs-trust-framework/ for a GitHub Pages project site.
Pass --rule-identities to compare the permanent pages with a registry other
than the repository's rule-identities.json, and --change-provenance to compare
the "Why this changed" notes with a register other than the repository's
change-provenance.json (the baseline is read from the framework-baseline.json
next to it).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

EXTERNAL_SCHEMES = {"http", "https", "mailto", "tel"}
REGISTRY = Path(__file__).resolve().parent.parent / "rule-identities.json"
PROVENANCE = Path(__file__).resolve().parent.parent / "change-provenance.json"
IDENTITY = re.compile(r"^r\d{4,}$")
CHANGE_ID = re.compile(r"^c\d{4,}$")
ISSUE_LINK = re.compile(r"^https://github\.com/[^/]+/[^/]+/issues/(\d+)$")
PULL_LINK = re.compile(r"^https://github\.com/[^/]+/[^/]+/pull/(\d+)$")
CHANGE_PAGE = re.compile(r"^changes/[^/]+/index\.html$")


class Page(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.links: list[str] = []
        self.headings: list[int] = []
        self.images_without_alt = 0
        self.lang = ""
        self.has_title = False
        self.has_phase_banner = False
        # The links in the draft status banner, and how deep in <div>s it starts.
        self.banner_links: list[str] = []
        self._banner_depth: int | None = None
        self.text: list[str] = []
        self.duplicate_ids: list[str] = []
        # Rule-level feedback: the attributes of each rule block, (anchor,
        # index of its block or None) for each rule, and the values in the
        # rule picker.
        self.rule_blocks: list[dict[str, str]] = []
        self.rules: list[tuple[str, int | None]] = []
        self.picker_options: list[str] = []
        self._open_block: int | None = None
        # Changes to the trust framework since its baseline.
        self.framework_status: str | None = None
        self.changed_sections_declared: int | None = None
        self.changed_section_links = 0
        self.section_changed_notice = False
        self._in_picker = False
        # The search page: whether its results area and fallback are hidden
        # as built, and the links in the fallback.
        self.search_enhanced_hidden: bool | None = None
        self.search_fallback_hidden: bool | None = None
        self.search_fallback_links = 0
        self._div_depth = 0
        self._fallback_depth: int | None = None
        # A rule's permanent page: its identity and status, the links to the
        # rule (data-rule-destination) and to the rules that replace it.
        self.identity: str | None = None
        self.identity_status: str | None = None
        self.destinations: list[str] = []
        self.replacements: list[str] = []
        # The site navigation: (href, aria-current) for each of its links.
        self.nav_links: list[tuple[str, str | None]] = []
        self._in_nav_list = False
        # "Back to top": the address, whether it is hidden as built, and the
        # text of each link.
        self.back_to_top: list[dict] = []
        self._in_back_to_top = False
        # Existing feedback: on a section page, (href, count) for its "See
        # existing feedback about this section" link; on the existing
        # feedback page, each section, its groups (the whole section, or a
        # rule) and the issues in each group.
        self.section_feedback_links: list[tuple[str, str]] = []
        self.feedback_sections: list[dict] = []
        # Why changes were made: the number of "Why this changed" notes, and
        # each entry in them, with its explanation and its issue and pull
        # request links ({"number", "href", "text"}).
        self.provenance_notes = 0
        self.provenance: list[dict] = []
        self._in_rationale = False
        self._provenance_link: dict | None = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "div":
            self._div_depth += 1
        if "data-search-enhanced" in a:
            self.search_enhanced_hidden = "hidden" in a
        if "data-search-fallback" in a:
            self.search_fallback_hidden = "hidden" in a
            self._fallback_depth = self._div_depth
        if tag == "div" and "govuk-phase-banner" in (a.get("class") or "").split():
            self._banner_depth = self._div_depth
        if tag == "a" and self._banner_depth is not None and a.get("href"):
            self.banner_links.append(a["href"])
        if tag == "a" and self._fallback_depth is not None and a.get("href"):
            self.search_fallback_links += 1
        if tag == "ul" and "govuk-service-navigation__list" in (a.get("class") or "").split():
            self._in_nav_list = True
        if tag == "a" and self._in_nav_list and a.get("href"):
            self.nav_links.append((a["href"], a.get("aria-current")))
        if a.get("id"):
            if a["id"] in self.ids:
                self.duplicate_ids.append(a["id"])
            self.ids.add(a["id"])
        classes = (a.get("class") or "").split()
        if tag == "a" and "app-back-to-top__link" in classes:
            self.back_to_top.append({"href": a.get("href") or "", "hidden": "hidden" in a, "text": ""})
            self._in_back_to_top = True
        if tag == "div" and "app-rule-block" in classes:
            self.rule_blocks.append({key: a.get(key) or "" for key in ("data-rule", "data-reference", "data-rule-id", "id", "data-feedback-count", "data-feedback-href")})
            self._open_block = len(self.rule_blocks) - 1
        if tag == "a" and "data-feedback-count" in a:
            self.section_feedback_links.append((a.get("href") or "", a["data-feedback-count"]))
        if "data-feedback-section" in a:
            self.feedback_sections.append({"id": a.get("id") or "", "file": a["data-feedback-section"], "count": a.get("data-feedback-count") or "", "groups": []})
        if "data-feedback-group" in a and self.feedback_sections:
            self.feedback_sections[-1]["groups"].append({"kind": a["data-feedback-group"], "rule": a.get("data-feedback-rule") or "", "id": a.get("id") or "", "issues": []})
        if tag == "a" and "data-feedback-issue" in a and self.feedback_sections and self.feedback_sections[-1]["groups"]:
            self.feedback_sections[-1]["groups"][-1]["issues"].append((a["data-feedback-issue"], a.get("href") or ""))
        if "data-provenance" in a:
            self.provenance_notes += 1
        if "data-provenance-entry" in a:
            self.provenance.append({"id": a["data-provenance-entry"] or "", "rationale": None, "issues": [], "pulls": []})
        if "data-provenance-rationale" in a and self.provenance:
            self.provenance[-1]["rationale"] = ""
            self._in_rationale = True
        if tag == "a" and self.provenance and ("data-provenance-issue" in a or "data-provenance-pull" in a):
            kind = "issues" if "data-provenance-issue" in a else "pulls"
            number = a.get("data-provenance-issue") if kind == "issues" else a.get("data-provenance-pull")
            self.provenance[-1][kind].append({"number": number or "", "href": a.get("href") or "", "text": ""})
            self._provenance_link = self.provenance[-1][kind][-1]
        if a.get("data-rule-identity"):
            self.identity = a["data-rule-identity"]
            self.identity_status = a.get("data-rule-status")
        if tag == "a" and "data-rule-destination" in a:
            self.destinations.append(a.get("href") or "")
        if tag == "a" and a.get("data-rule-replacement"):
            self.replacements.append(a.get("href") or "")
        if tag == "p" and "app-rule" in classes:
            self.rules.append((a.get("id", ""), self._open_block))
            self._open_block = None
        if a.get("data-framework-status"):
            self.framework_status = a["data-framework-status"]
            if a.get("data-changed-sections", "").isdigit():
                self.changed_sections_declared = int(a["data-changed-sections"])
        if tag == "a" and "app-changed-section" in classes:
            self.changed_section_links += 1
        if "app-section-changed" in classes:
            self.section_changed_notice = True
        if tag == "select" and a.get("id") == "rule-feedback-reference":
            self._in_picker = True
        if tag == "option" and self._in_picker and a.get("value"):
            self.picker_options.append(a["value"])
        if tag == "a" and a.get("name"):
            self.ids.add(a["name"])
        if tag == "html":
            self.lang = a.get("lang", "")
        if tag == "title":
            self.has_title = True
        if tag in ("a", "link") and a.get("href"):
            self.links.append(a["href"])
        if tag == "form" and a.get("action"):
            self.links.append(a["action"])
        if tag in ("img", "script") and a.get("src"):
            self.links.append(a["src"])
        if tag == "img" and "alt" not in a:
            self.images_without_alt += 1
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.headings.append(int(tag[1]))
        if "govuk-phase-banner" in (a.get("class") or "").split():
            self.has_phase_banner = True

    def handle_endtag(self, tag):
        if tag == "select":
            self._in_picker = False
        if tag == "ul":
            self._in_nav_list = False
        if tag == "a":
            self._in_back_to_top = False
            self._provenance_link = None
        if tag == "p":
            self._in_rationale = False
        if tag == "div":
            if self._fallback_depth == self._div_depth:
                self._fallback_depth = None
            if self._banner_depth == self._div_depth:
                self._banner_depth = None
            self._div_depth -= 1

    def handle_data(self, data):
        self.text.append(data)
        if self._in_back_to_top:
            self.back_to_top[-1]["text"] += data
        if self._in_rationale:
            self.provenance[-1]["rationale"] += data
        if self._provenance_link is not None:
            self._provenance_link["text"] += data

    def handle_comment(self, data):
        self.text.append(f"<!--{data}-->")


def parse(path: Path) -> Page:
    page = Page()
    page.feed(path.read_text(encoding="utf-8"))
    return page


def resolve(site: Path, page_path: Path, href: str, prefix: str) -> tuple[Path | None, str]:
    """Map an internal link to (file in the built site, fragment). None means external."""
    parts = urlsplit(href)
    if parts.scheme in EXTERNAL_SCHEMES:
        return None, ""
    if parts.scheme or parts.netloc:
        return site / f"__unexpected_url__{parts.scheme}", ""
    path = unquote(parts.path)
    if not path:
        return page_path, parts.fragment
    if path.startswith("/"):
        if not path.startswith(prefix):
            return site / "__outside_path_prefix__", ""
        target = site / path[len(prefix):]
    else:
        target = (page_path.parent / path).resolve()
    if path.endswith("/") or target.is_dir():
        target = target / "index.html"
    return target, parts.fragment


def rule_problems(page: Page) -> list[str]:
    """Problems with the anchors and feedback routes of a page's numbered rules."""
    problems = []
    for anchor, block in page.rules:
        if block is None:
            problems.append(f"rule {anchor!r} has no feedback block")
            continue
        attrs = page.rule_blocks[block]
        number, reference, identity = attrs["data-rule"], attrs["data-reference"], attrs["data-rule-id"]
        if anchor != "section-" + number.replace(".", "_"):
            problems.append(f"rule {number!r} has anchor {anchor!r}, which does not match its number")
        if not IDENTITY.match(identity):
            problems.append(f"rule {number!r} has no permanent identity (data-rule-id)")
            continue
        if attrs["id"] != f"rule-{identity}":
            problems.append(f"the block for rule {number!r} should have the anchor rule-{identity}, not {attrs['id']!r}")
        target = reference.removeprefix(f"[{number}](").removesuffix(")") if reference.startswith(f"[{number}](") else ""
        if not target or not urlsplit(target).path.endswith(f"/rules/{identity}/") or urlsplit(target).fragment:
            problems.append(f"the feedback reference for rule {number!r} does not link to its permanent address /rules/{identity}/: {reference!r}")
    if len(page.rule_blocks) != len(page.rules):
        problems.append(f"{len(page.rule_blocks)} rule blocks but {len(page.rules)} rules")
    if page.rule_blocks and page.picker_options != [attrs["data-reference"] for attrs in page.rule_blocks]:
        problems.append("the rule picker does not list exactly the rules on the page, in order")
    return problems


def banner_problems(rel: str, page: Page) -> list[str]:
    """Problems with the draft status banner's link to give feedback."""
    if not page.has_phase_banner:
        return ["draft status banner is missing"]
    choosers = [href for href in page.banner_links if urlsplit(href).path.endswith("/issues/new/choose")]
    if len(choosers) != 1:
        return [f"the draft status banner should have one link to give feedback, found {len(choosers)}"]
    references = parse_qs(urlsplit(choosers[0]).query).get("reference", [])
    if not rel.startswith("trust-framework-1.0/"):
        return [f"the draft status banner's feedback link fills in a reference on a page that is not part of the trust framework: {references[0]!r}"] if references else []
    # The page's own address, as a Markdown link: "[12. Service requirements](https://…/12-service-requirements/)".
    own = "/" + rel.removesuffix("index.html")
    target = references[0].rpartition("](")[2].removesuffix(")") if references and references[0].startswith("[") else ""
    if not target or not urlsplit(target).path.endswith(own) or urlsplit(target).fragment:
        return [f"the draft status banner's feedback link should fill in this page ({own}), not {references[0] if references else 'nothing'!r}"]
    return []


def back_to_top_problems(page: Page) -> list[str]:
    """Problems with the "Back to top" link at the end of the page."""
    if len(page.back_to_top) != 1:
        return [f'expected one "Back to top" link (app-back-to-top__link), found {len(page.back_to_top)}']
    link = page.back_to_top[0]
    problems = []
    if link["href"] != "#top" or "top" not in page.ids:
        problems.append(f'the "Back to top" link should go to #top, an element on the page, not {link["href"]!r}')
    if link["hidden"]:
        problems.append('the "Back to top" link must be shown as built, so that it works without JavaScript')
    text = " ".join(link["text"].split())
    if text != "Back to top":
        problems.append(f'the "Back to top" link should say "Back to top", not {text!r}')
    return problems


def read_registry(path: Path | None) -> dict[str, str] | None:
    """The identities in rule-identities.json and their status ("current" or "retired"), or None if not given."""
    if path is None:
        return None
    entries = json.loads(path.read_text(encoding="utf-8"))["rules"]
    return {entry["id"]: entry.get("status", "current") for entry in entries}


def identity_problems(pages: dict[Path, Page], site: Path, prefix: str, registry: dict[str, str] | None) -> list[str]:
    """Problems with the permanent addresses of rules (/rules/<identity>/) and where they go."""
    problems = []
    rel = lambda path: path.relative_to(site).as_posix()  # noqa: E731
    blocks: dict[str, list[tuple[Path, str]]] = {}
    for path, page in pages.items():
        for attrs in page.rule_blocks:
            if attrs["data-rule-id"]:
                blocks.setdefault(attrs["data-rule-id"], []).append((path, attrs["data-rule"]))
    for identity, places in sorted(blocks.items()):
        if len(places) > 1:
            problems.append(f"the permanent identity {identity} is on more than one rule: {', '.join(f'{number} ({rel(path)})' for path, number in places)}")
    identity_pages = {page.identity: (path, page) for path, page in pages.items() if page.identity}
    for identity, (path, page) in sorted(identity_pages.items()):
        where = rel(path)
        if where != f"rules/{identity}/index.html":
            problems.append(f"{where}: the permanent page for {identity} should be rules/{identity}/index.html")
        status = page.identity_status
        if status == "current":
            if len(page.destinations) != 1:
                problems.append(f"{where}: a permanent page should have one link to its rule, found {len(page.destinations)}")
                continue
            target, fragment = resolve(site, path, page.destinations[0], prefix)
            if target is None or target.resolve() not in pages:
                problems.append(f"{where}: the link to rule {identity} does not go to a page of the site: {page.destinations[0]}")
                continue
            here = [attrs for attrs in pages[target.resolve()].rule_blocks if attrs["id"] == fragment]
            if fragment != f"rule-{identity}" or not here or here[0]["data-rule-id"] != identity:
                problems.append(f"{where}: the link to rule {identity} does not go to that rule's block: {page.destinations[0]}")
        elif status == "retired":
            if page.destinations:
                problems.append(f"{where}: {identity} is retired, so its page must not link to a rule as if it were current")
            if identity in blocks:
                problems.append(f"{where}: {identity} is retired, but a rule on {rel(blocks[identity][0][0])} has it")
            for href in page.replacements:
                target, _ = resolve(site, path, href, prefix)
                replacement = pages.get(target.resolve()) if target is not None else None
                if replacement is None or not replacement.identity or replacement.identity == identity:
                    problems.append(f"{where}: a replacement link does not go to another rule's permanent page: {href}")
        else:
            problems.append(f"{where}: unknown status {status!r} for {identity}")
    for identity, places in sorted(blocks.items()):
        found = identity_pages.get(identity)
        if found is None:
            problems.append(f"{rel(places[0][0])}: rule {places[0][1]} has the permanent identity {identity}, which has no page (rules/{identity}/)")
        elif found[1].identity_status != "current":
            problems.append(f"{rel(places[0][0])}: rule {places[0][1]} has the permanent identity {identity}, whose page says it is {found[1].identity_status}")
    if registry is not None:
        for identity, status in sorted(registry.items()):
            found = identity_pages.get(identity)
            if found is None:
                problems.append(f"rule-identities.json: {identity} has no permanent page (rules/{identity}/)")
            elif found[1].identity_status != status:
                problems.append(f"rules/{identity}/index.html: says the rule is {found[1].identity_status}, but rule-identities.json says {status}")
        for identity in sorted(set(identity_pages) - set(registry)):
            problems.append(f"rules/{identity}/index.html: {identity} is not in rule-identities.json")
    return problems


def existing_feedback_problems(pages: dict[Path, Page], site: Path, prefix: str) -> list[str]:
    """Problems with the links to existing feedback, and the page that lists it."""
    problems: list[str] = []
    rel = lambda path: path.relative_to(site).as_posix()  # noqa: E731
    listing_path = (site / "existing-feedback" / "index.html").resolve()
    listing = pages.get(listing_path)
    where = "existing-feedback/index.html"
    rule_groups: dict[str, dict] = {}
    sections: dict[str, dict] = {}
    for section in listing.feedback_sections if listing else []:
        sections[section["id"]] = section
        issues: set[str] = set()
        if not section["groups"]:
            problems.append(f"{where}: {section['file']} is listed with no feedback")
        for group in section["groups"]:
            label = f"rule {group['rule']}" if group["kind"] == "rule" else f"{section['file']} as a whole"
            if not group["issues"]:
                problems.append(f"{where}: the feedback about {label} lists no issues")
            for number, href in group["issues"]:
                match = ISSUE_LINK.match(href)
                if not match or match.group(1) != number:
                    problems.append(f"{where}: issue {number} about {label} does not link to that issue on GitHub: {href!r}")
                issues.add(number)
            if group["kind"] == "rule":
                if not IDENTITY.match(group["rule"]) or group["id"] != f"rule-{group['rule']}":
                    problems.append(f"{where}: the feedback about rule {group['rule']!r} should have the anchor rule-{group['rule']}, not {group['id']!r}")
                rule_groups[group["rule"]] = group
        if section["count"] != str(len(issues)):
            problems.append(f"{where}: {section['file']} says it has {section['count']} issue(s) but lists {len(issues)}")
    linked_rules: set[str] = set()
    linked_sections: set[str] = set()
    for path, page in sorted(pages.items()):
        for attrs in page.rule_blocks:
            href, count = attrs["data-feedback-href"], attrs["data-feedback-count"]
            if not href and not count:
                continue
            number, identity = attrs["data-rule"], attrs["data-rule-id"]
            parts = urlsplit(href)
            target = (site / unquote(parts.path) / "index.html").resolve() if parts.path else None
            if parts.scheme or parts.netloc or href.startswith("/") or target != listing_path or parts.fragment != f"rule-{identity}":
                problems.append(f"{rel(path)}: the existing feedback link for rule {number!r} should be existing-feedback/#rule-{identity}, relative to the site root, not {href!r}")
                continue
            group = rule_groups.get(identity)
            if group is None:
                problems.append(f"{rel(path)}: rule {number!r} says it has existing feedback, but {where} lists none for {identity}")
            elif count != str(len(group["issues"])):
                problems.append(f"{rel(path)}: rule {number!r} says it has {count!r} existing feedback issue(s), but {where} lists {len(group['issues'])}")
            linked_rules.add(identity)
        for href, count in page.section_feedback_links:
            target, fragment = resolve(site, path, href, prefix)
            section = sections.get(fragment) if target is not None and target.resolve() == listing_path else None
            if section is None:
                problems.append(f"{rel(path)}: the existing feedback link for this section does not go to a section on {where}: {href!r}")
                continue
            if rel(path).removesuffix("index.html") != section["file"].removesuffix(".md") + "/":
                problems.append(f"{rel(path)}: the existing feedback link goes to the feedback about {section['file']}, not this section")
            elif count != section["count"]:
                problems.append(f"{rel(path)}: the existing feedback link says {count!r} issue(s), but {where} lists {section['count']!r} for this section")
            linked_sections.add(section["id"])
    for identity in sorted(set(rule_groups) - linked_rules):
        problems.append(f"{where}: lists feedback about rule {identity}, but no rule block links to it")
    for anchor, section in sorted(sections.items()):
        if anchor not in linked_sections:
            problems.append(f"{where}: lists feedback about {section['file']}, but that section's page does not link to it")
    return problems


def read_provenance(path: Path | None) -> tuple[list[dict], str | None] | None:
    """The entries in change-provenance.json for the current baseline, and that baseline, or None if not given."""
    if path is None:
        return None
    entries = json.loads(path.read_text(encoding="utf-8")).get("changes", [])
    baseline_file = path.parent / "framework-baseline.json"
    baseline = json.loads(baseline_file.read_text(encoding="utf-8")).get("tag") if baseline_file.exists() else None
    return [entry for entry in entries if entry.get("baseline") == baseline], baseline


def provenance_problems(pages: dict[Path, Page], site: Path, register: tuple[list[dict], str | None] | None) -> list[str]:
    """Problems with the "Why this changed" notes on the "What's changed" pages."""
    problems: list[str] = []
    rendered: dict[str, list[tuple[str, dict]]] = {}
    for path, page in sorted(pages.items()):
        rel = path.relative_to(site).as_posix()
        if not page.provenance_notes and not page.provenance:
            continue
        if not CHANGE_PAGE.match(rel):
            problems.append(f"{rel}: has a \"Why this changed\" note, but those belong only on a section's \"What's changed\" page (changes/<section>/)")
            continue
        for entry in page.provenance:
            name = entry["id"]
            if not CHANGE_ID.match(name):
                problems.append(f"{rel}: a \"Why this changed\" entry has the id {name!r}, not one like c0001")
            if entry["rationale"] is None and not entry["issues"] and not entry["pulls"]:
                problems.append(f"{rel}: entry {name} says nothing about why the change was made")
            for kind, pattern, noun in (("issues", ISSUE_LINK, "issue"), ("pulls", PULL_LINK, "pull request")):
                for link in entry[kind]:
                    match = pattern.match(link["href"])
                    if not match or match.group(1) != link["number"]:
                        problems.append(f"{rel}: entry {name} links {noun} {link['number']} to {link['href']!r}, which is not that {noun} on GitHub")
                    want = f"{noun} #{link['number']}"
                    if " ".join(link["text"].split()) != want:
                        problems.append(f"{rel}: entry {name}'s link to {noun} {link['number']} should say {want!r}, not {link['text'].strip()!r}")
            rendered.setdefault(name, []).append((rel, entry))
    if register is None:
        return problems
    entries, baseline = register
    expected = {entry.get("id"): entry for entry in entries}
    for name, places in sorted(rendered.items()):
        entry = expected.get(name)
        if entry is None:
            problems.append(f"{places[0][0]}: shows entry {name}, but change-provenance.json has no entry {name} for the current baseline ({baseline})")
            continue
        want = {
            "rationale": entry["rationale"].strip() if isinstance(entry.get("rationale"), str) else None,
            "issues": [str(number) for number in entry.get("issues", [])],
            "pulls": [str(number) for number in entry.get("pullRequests", [])],
        }
        for rel, shown in places:
            got = {"rationale": shown["rationale"], "issues": [link["number"] for link in shown["issues"]], "pulls": [link["number"] for link in shown["pulls"]]}
            for key, label in (("rationale", "explanation"), ("issues", "issues"), ("pulls", "pull requests")):
                if got[key] != want[key]:
                    problems.append(f"{rel}: entry {name} shows the {label} {got[key]!r}, but change-provenance.json gives {want[key]!r}")
    for name in sorted(set(expected) - set(rendered)):
        problems.append(f"change-provenance.json: entry {name} explains a change since {baseline}, but no \"What's changed\" page shows it")
    return problems


def change_problems(pages: dict[Path, Page], site: Path) -> list[str]:
    """Problems with what the site says about changes to the trust framework."""
    reporting = [(path, page) for path, page in pages.items() if page.framework_status]
    if not reporting:
        return ["no page says whether the trust framework wording has changed (the /changes/ page is missing)"]
    if len(reporting) > 1:
        return [f"{len(reporting)} pages say whether the trust framework wording has changed; expected only /changes/"]
    path, page = reporting[0]
    rel = path.relative_to(site.resolve()).as_posix()
    status, listed = page.framework_status, page.changed_section_links
    notices = sorted(p.relative_to(site.resolve()).as_posix() for p, other in pages.items() if other.section_changed_notice)
    if status == "unavailable":
        return [f"{rel}: the trust framework could not be compared with its baseline, so the site cannot say what has changed"]
    if status == "unchanged":
        problems = []
        if listed:
            problems.append(f"{rel}: says the wording is unchanged but lists {listed} changed section(s)")
        problems.extend(f"{notice}: says the section has changed, but {rel} says the wording is unchanged" for notice in notices)
        return problems
    if status == "changed":
        if not listed or listed != page.changed_sections_declared:
            return [f"{rel}: says {page.changed_sections_declared} section(s) changed but lists {listed}"]
        return []
    return [f"{rel}: unknown trust framework change status {status!r}"]


# Text that belongs to the site layout or the repository, not the trust
# framework, so must never be in the search index.
NOT_FRAMEWORK_TEXT = (
    "caution-banner",
    "Repository navigation",
    "This is a working draft",
    "Give feedback on",
    "Choose a rule",
    "Continue to GitHub",
    "On this page",
    "existing feedback",
)


def search_problems(pages: dict[Path, Page], site: Path) -> list[str]:
    """Problems with the search index: destinations, repeated numbers and site furniture."""
    index_path = site / "search-index.json"
    if not index_path.exists():
        return ["search-index.json is missing"]
    text = index_path.read_text(encoding="utf-8")
    try:
        index = json.loads(text)
        index_pages, entries = index["pages"], index["entries"]
    except (ValueError, KeyError) as error:
        return [f"search-index.json cannot be read: {error}"]
    if not entries:
        return ["search-index.json has no entries"]
    problems = []
    seen: set[str] = set()
    for entry in entries:
        url = index_pages[entry["page"]]["url"]
        anchor = entry.get("anchor", "")
        where = f"search-index.json: {entry.get('ref') or entry.get('title') or entry.get('kind')} ({url}#{anchor})"
        if url.startswith("/") or "://" in url:
            problems.append(f"{where}: the page address must be relative to the site root")
            continue
        target = (site / url / "index.html").resolve()
        if target not in pages:
            problems.append(f"{where}: no such page")
        elif anchor and anchor not in pages[target].ids:
            problems.append(f"{where}: no such anchor on the page")
        ref = entry.get("ref")
        if ref:
            if ref in seen:
                problems.append(f"search-index.json: {ref} is in the index more than once")
            seen.add(ref)
        if entry.get("kind") == "rule" and not IDENTITY.match(entry.get("id", "")):
            problems.append(f"{where}: the rule has no permanent identity")
    identities = [entry["id"] for entry in entries if entry.get("id")]
    identities += [item.get("id", "") for item in index.get("identities", [])]
    identities += [identity for item in index.get("former", []) for identity in item.get("ids", [])]
    for identity in sorted(set(identities)):
        if (site / "rules" / identity / "index.html").resolve() not in pages:
            problems.append(f"search-index.json: {identity} has no permanent page (rules/{identity}/)")
    problems.extend(f"search-index.json: site or repository text is in the index: {leaked!r}" for leaked in NOT_FRAMEWORK_TEXT if leaked in text)
    return problems


def navigation_problems(site: Path, path: Path, page: Page, prefix: str) -> list[str]:
    """Problems with how the site navigation marks the current page."""
    problems = []
    marked = [href for href, current in page.nav_links if current]
    if len(marked) > 1:
        problems.append(f"more than one navigation link is marked as current: {', '.join(marked)}")
    for href, current in page.nav_links:
        target, _ = resolve(site, path, href, prefix)
        if target is not None and target.resolve() == path and current != "page":
            problems.append(f"the navigation link to this page ({href}) is not marked aria-current=\"page\"")
    return problems


def search_page_problems(pages: dict[Path, Page], site: Path) -> list[str]:
    """Problems with what the search page shows before its script runs."""
    path = (site / "search" / "index.html").resolve()
    page = pages.get(path)
    if page is None:
        return ["search/index.html is missing"]
    problems = []
    if page.search_enhanced_hidden is not True:
        problems.append("search/index.html: the search results area must be hidden until the search script starts it")
    if page.search_fallback_hidden is not False:
        problems.append("search/index.html: the other way to find a rule (data-search-fallback) must be shown as built")
    elif page.search_fallback_links < 2:
        problems.append("search/index.html: the other way to find a rule (data-search-fallback) has no links to the sections")
    return problems


def check(site: Path, prefix: str, registry_path: Path | None = None, provenance_path: Path | None = None) -> list[str]:
    problems: list[str] = []
    pages = {p.resolve(): parse(p) for p in site.rglob("*.html")}
    if not pages:
        return [f"no HTML pages found in {site}"]
    for path, page in sorted(pages.items()):
        rel = path.relative_to(site.resolve()).as_posix()
        text = "".join(page.text)
        if not page.lang:
            problems.append(f"{rel}: <html> has no lang attribute")
        if not page.has_title:
            problems.append(f"{rel}: page has no <title>")
        if page.headings.count(1) != 1:
            problems.append(f"{rel}: expected exactly one <h1>, found {page.headings.count(1)}")
        for before, after in zip(page.headings, page.headings[1:]):
            if after > before + 1:
                problems.append(f"{rel}: heading level jumps from <h{before}> to <h{after}>")
                break
        if page.images_without_alt:
            problems.append(f"{rel}: {page.images_without_alt} image(s) without an alt attribute")
        problems.extend(f"{rel}: {problem}" for problem in banner_problems(rel, page))
        for duplicate in sorted(set(page.duplicate_ids)):
            problems.append(f"{rel}: more than one element has id {duplicate!r}")
        problems.extend(f"{rel}: {problem}" for problem in rule_problems(page))
        problems.extend(f"{rel}: {problem}" for problem in navigation_problems(site.resolve(), path, page, prefix))
        problems.extend(f"{rel}: {problem}" for problem in back_to_top_problems(page))
        for leaked in ("caution-banner:", "Repository navigation"):
            if leaked in text:
                problems.append(f"{rel}: repository-only text leaked into the page: {leaked!r}")
        for href in page.links:
            target, fragment = resolve(site.resolve(), path, href, prefix)
            if target is None:
                continue
            if not target.exists():
                problems.append(f"{rel}: broken link: {href}")
            elif fragment and target.suffix == ".html":
                ids = pages[target.resolve()].ids if target.resolve() in pages else parse(target).ids
                if fragment not in ids:
                    problems.append(f"{rel}: missing anchor: {href}")
    problems.extend(change_problems(pages, site))
    problems.extend(identity_problems(pages, site.resolve(), prefix, read_registry(registry_path)))
    problems.extend(existing_feedback_problems(pages, site.resolve(), prefix))
    problems.extend(provenance_problems(pages, site.resolve(), read_provenance(provenance_path)))
    problems.extend(search_problems(pages, site.resolve()))
    problems.extend(search_page_problems(pages, site.resolve()))
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description="Check the built reading site.")
    parser.add_argument("site", type=Path, help="the built site directory, for example docs-site/_site")
    parser.add_argument("--path-prefix", default="/", help="URL prefix the site was built for (default: /)")
    parser.add_argument("--rule-identities", type=Path, default=REGISTRY, help="the rule identity registry (default: rule-identities.json)")
    parser.add_argument("--change-provenance", type=Path, default=PROVENANCE, help="the register of why changes were made (default: change-provenance.json)")
    args = parser.parse_args()
    prefix = args.path_prefix if args.path_prefix.endswith("/") else args.path_prefix + "/"
    problems = check(args.site, prefix, args.rule_identities, args.change_provenance)
    for problem in problems:
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print(f"::error::{problem}")
        else:
            print(f"ERROR: {problem}")
    pages = len(list(args.site.rglob("*.html")))
    if problems:
        print(f"\n{len(problems)} problem(s) found in {pages} pages.")
        return 1
    print(f"{pages} pages checked: links, anchors, IDs, headings, images, status banner, rule feedback, permanent rule links, existing feedback links, the change status, why changes were made, the search index, the search fallback, the navigation and the Back to top link are all in order.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
