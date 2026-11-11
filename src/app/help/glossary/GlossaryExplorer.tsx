"use client";

import { useMemo, useState } from "react";
import { GLOSSARY_TERMS, searchHelpItems } from "@/lib/help-content";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function GlossaryExplorer() {
  const [query, setQuery] = useState("");

  const terms = useMemo(
    () => searchHelpItems(GLOSSARY_TERMS, query, ["term", "definition"]),
    [query],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label htmlFor="glossary-search">Search terms</Label>
        <Input
          id="glossary-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. ROAS, COGS, margin…"
        />
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
