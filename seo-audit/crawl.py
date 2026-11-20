#!/usr/bin/env python3
"""Phase 0 crawler — GetProfitCalc. Local proof only (not committed as code).
Fetches every live sitemap URL + internal links found on the homepage,
records status / redirect / canonical / robots / title / description /
H1 count / word count, and builds the internal inlink graph.
Writes seo-audit/crawl.csv in the repo (seo-overhaul branch).
Usage: python3 seo-audit/crawl.py  (run from the repo root)
"""
import csv
import re
import sys
import time
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from collections import Counter
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

BASE = "https://getprofitcalc.com"
UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
OUT = "seo-audit/crawl.csv"
SITEMAP = f"{BASE}/sitemap.xml"


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.description = ""
        self.canonical = ""
        self.robots = ""
        self.h1 = 0
        self.links = []
        self._in_title = False
        self._in_script = False
        self._in_style = False
        self._text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "script":
            self._in_script = True
        elif tag == "style":
            self._in_style = True
        elif tag == "meta":
            name = (a.get("name") or a.get("property") or "").lower()
            if name == "description":
                self.description = a.get("content", "")
            elif name == "robots":
                self.robots = a.get("content", "")
        elif tag == "link" and a.get("rel") == "canonical":
            self.canonical = a.get("href", "")
        elif tag == "h1":
            self.h1 += 1
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script":
            self._in_script = False
        elif tag == "style":
            self._in_style = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if not self._in_script and not self._in_style:
            self._text.append(data)

    def word_count(self):
        return len(" ".join(self._text).split())


def fetch(url):
    """Returns (status, final_url, headers, body, redirect_chain)."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    chain = []
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = resp.read().decode("utf-8", "replace")
            return resp.status, resp.geturl(), dict(resp.headers), body, chain
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, e.geturl(), dict(e.headers), body, chain
    except Exception as e:
        return 0, url, {}, "", [f"ERROR: {e}"]


def main():
    req = urllib.request.Request(SITEMAP, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as resp:
        xml = resp.read().decode("utf-8")
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(xml)
    sitemap_urls = [el.text.strip() for el in root.findall(".//s:loc", ns)]
    print(f"sitemap URLs: {len(sitemap_urls)}", flush=True)

    # Seed with the sitemap; add internal links found on the homepage.
    to_visit = list(dict.fromkeys(sitemap_urls))
    home_body = fetch(BASE + "/")[3]
    hp = PageParser()
    hp.feed(home_body)
    extra = set()
    for href in hp.links:
        full = urljoin(BASE, href)
        p = urlparse(full)
        if p.netloc == "getprofitcalc.com" and p.scheme == "https":
            clean = f"{p.scheme}://{p.netloc}{p.path}"
            if clean not in sitemap_urls:
                extra.add(clean)
    print(f"extra internal URLs from homepage: {len(extra)}", flush=True)
    to_visit += sorted(extra)

    rows = []
    inlinks = Counter()
    for i, url in enumerate(to_visit):
        status, final, headers, body, _ = fetch(url)
        p = PageParser()
        if body:
            try:
                p.feed(body)
            except Exception:
                pass
        for href in p.links:
            full = urljoin(final or url, href)
            pp = urlparse(full)
            if pp.netloc == "getprofitcalc.com":
                inlinks[f"{pp.scheme}://{pp.netloc}{pp.path}"] += 1
        rows.append({
            "url": url,
            "status": status,
            "final_url": final,
            "redirect": "Y" if final != url else "N",
            "canonical": p.canonical,
            "meta_robots": p.robots,
            "x_robots_tag": headers.get("X-Robots-Tag", ""),
            "title": p.title.strip(),
            "title_len": len(p.title.strip()),
            "description": p.description,
            "desc_len": len(p.description),
            "h1_count": p.h1,
            "word_count": p.word_count(),
            "in_sitemap": "Y" if url in sitemap_urls else "N",
        })
        if (i + 1) % 25 == 0:
            print(f"  {i + 1}/{len(to_visit)}", flush=True)
        time.sleep(0.15)

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) + ["inlinks"])
        w.writeheader()
        for r in rows:
            r["inlinks"] = inlinks.get(r["final_url"] or r["url"], 0)
            w.writerow(r)
    print(f"wrote {OUT}: {len(rows)} rows", flush=True)
    statuses = Counter(r["status"] for r in rows)
    print("statuses:", dict(statuses), flush=True)
    print("redirects:", sum(1 for r in rows if r["redirect"] == "Y"), flush=True)
    print("non-self-canonical:", sum(1 for r in rows if r["canonical"] and r["canonical"] != r["final_url"]), flush=True)
    print("missing title:", sum(1 for r in rows if not r["title"]), flush=True)
    print("h1 != 1:", sum(1 for r in rows if r["h1_count"] != 1), flush=True)


if __name__ == "__main__":
    main()
