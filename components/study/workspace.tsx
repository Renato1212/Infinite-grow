"use client";
import * as React from "react";
import { FilterBar } from "./filter-bar";
import { PivotBuilder } from "./pivot";
import { CorrelationExplorer } from "./correlation";
import { SqlConsole } from "./sql-console";
import { Explainer } from "@/components/explainer";
import { Button } from "@/components/ui/button";
import { EmptyState, Card } from "@/components/ui/surface";
import {
  ConsistencyCard, DisciplineCard, DomainMatrixCard, EnvironmentCard,
  ExpectancyCard, HypothesisAccuracyCard, LevelPerformanceCard, MaeMfeCard,
  MistakesCard, PlanAdherenceCard, TimeOfDayCard,
} from "./cards";
import { serialiseFilter, type StudyFilter } from "@/lib/study/filters";
import type { Fact } from "@/lib/study/aggregate";

interface Props {
  facts: Fact[];
  levelStats: {
    bucket: string; n: number; respected: number; broke: number;
    broke_retested: number; no_touch: number; avg_ticks: string | null;
  }[];
  dayStats: {
    day: string; net_pnl: string; process_adherence_pct: string | null;
    focus_rating: number | null; reground_count: number;
  }[];
  filter: StudyFilter;
  instruments: { id: string; symbol: string }[];
  domains: { key: string; label: string }[];
  tags: { id: string; label: string; category: string }[];
  levelTypes: { key: string; label: string }[];
  minSampleSize: number;
  savedViews: { id: string; name: string; query: Record<string, unknown> }[];
  sampleExplainer: string | null;
  planExplainer: string | null;
  domainExplainer: string | null;
}

export function StudyWorkspace(props: Props) {
  const { facts, filter, minSampleSize: min } = props;
  const exportHref = (format: "csv" | "json") =>
    `/api/export?${serialiseFilter(filter).toString()}&format=${format}`;

  return (
    <div className="min-w-0">
      <header className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-24 font-[590] tracking-[-0.018em]">Study</h1>
          <p className="text-12 text-[var(--text-secondary)] mt-0.5">
            Every card respects the filter and shows its sample size.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={exportHref("csv")} download>
            <Button size="sm">Export CSV</Button>
          </a>
          <a href={exportHref("json")} download>
            <Button size="sm">Export JSON</Button>
          </a>
        </div>
      </header>

      <FilterBar
        filter={filter}
        instruments={props.instruments}
        domains={props.domains}
        tags={props.tags}
        levelTypes={props.levelTypes}
        savedViews={props.savedViews}
        resultCount={facts.length}
      />

      <Explainer id="sample-size" source={props.sampleExplainer} />

      {facts.length === 0 ? (
        <Card>
          <EmptyState
            title="No trades match this filter."
            body="Widen the date range, or clear the filter and start from everything. If the database is empty, run npm run db:seed to generate forty days of realistic data."
          />
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          <ExpectancyCard facts={facts} min={min} />
          <PlanAdherenceCard facts={facts} min={min} />
          <DomainMatrixCard facts={facts} min={min} />
          <HypothesisAccuracyCard facts={facts} min={min} />
          <TimeOfDayCard facts={facts} min={min} />
          <LevelPerformanceCard stats={props.levelStats} min={min} />
          <MaeMfeCard facts={facts} min={min} />
          <MistakesCard facts={facts} min={min} />
          <EnvironmentCard facts={facts} min={min} />
          <DisciplineCard days={props.dayStats} min={min} />
          <ConsistencyCard facts={facts} min={min} />
        </div>
      )}

      <div className="mt-8 space-y-3">
        <h2 className="text-15 font-[590]">Cross-analysis</h2>
        <PivotBuilder facts={facts} min={min} />
        <CorrelationExplorer facts={facts} />
        <SqlConsole />
      </div>
    </div>
  );
}
