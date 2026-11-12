"use client";

import { useMemo, useState } from "react";
import { GLOSSARY_TERMS, searchHelpItems } from "@/lib/help-content";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function GlossaryExplorer() {
  const [query, setQuery] = useState("");
  // Client-side filter — debounced like the FAQ search so typing does not
  // re-filter (and re-render the list) on every keystroke.
  const { debouncedValue: debouncedQuery, isPending: searchPending } = useDebouncedValue(query);

  const terms = useMemo(
    () => searchHelpItems(GLOSSARY_TERMS, debouncedQuery, ["term", "definition"]),
    [debouncedQuery],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label htmlFor="glossary-search">Search terms</Label>
        <div className="relative">
          <Input
            id="glossary-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. ROAS, COGS, margin…"
            className="pr-9"
            aria-label="Search terms"
          />
          {searchPending && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]">
              <Spinner size="sm" label="" />
            </span>
          )}
        </div>
      </div>
      <p className="text-sm text-[var(--color-muted-foreground)]" aria-live="polite">
        {terms.length === GLOSSARY_TERMS.length
          ? `${terms.length} terms`
          : `${terms.length} of ${GLOSSARY_TERMS.length} terms match`}
      </p>

      {terms.length === 0 && (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          No terms match that search. Try &ldquo;profit&rdquo;, &ldquo;margin&rdquo;, or &ldquo;AOV&rdquo;.
        </p>
      )}

      {terms.map((t) => (
        <Card key={t.id} id={t.id} className="scroll-mt-24">
          <CardHeader className="pb-1">
            <CardTitle>{t.term}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{t.definition}</p>
            {t.formula && (
              <p>
                <strong>Formula:</strong> <code>{t.formula}</code>
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
