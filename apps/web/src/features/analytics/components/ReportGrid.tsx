'use client';

import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  Users,
  Truck,
  Building2,
  MapPin,
  Clock,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@sally/ui/components/ui/card';
import { REPORT_CATEGORIES, getReportsForCategory } from '../data/report-configs';
import type { ReportCategory, ReportConfig } from '../types';

const ICON_MAP: Record<string, LucideIcon> = {
  DollarSign,
  TrendingUp,
  Users,
  Truck,
  Building2,
  MapPin,
  Clock,
  ShieldCheck,
};

function ReportCard({ config }: { config: ReportConfig }) {
  const Icon = ICON_MAP[config.icon] ?? DollarSign;
  return (
    <Link href={`/dispatcher/insights/${config.type}`} className="group">
      <Card className="h-full transition-colors hover:border-foreground/20">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
          <div className={`shrink-0 ${config.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <CardTitle className="text-sm font-semibold text-foreground group-hover:text-foreground/80 transition-colors">
            {config.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground leading-relaxed">{config.description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyCategoryCard({ category }: { category: ReportCategory }) {
  return (
    <Card className="h-full border-dashed">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
        <div className="shrink-0 text-muted-foreground/60">
          <Sparkles className="h-5 w-5" />
        </div>
        <CardTitle className="text-sm font-medium text-muted-foreground">More coming soon</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          {category} reports are on the way. New views will land here as they ship.
        </p>
      </CardContent>
    </Card>
  );
}

export function ReportGrid() {
  return (
    <div className="space-y-8">
      {REPORT_CATEGORIES.map((category) => {
        const reports = getReportsForCategory(category);
        return (
          <section key={category} aria-labelledby={`reports-${category.toLowerCase()}`}>
            <h2
              id={`reports-${category.toLowerCase()}`}
              className="text-xs font-semibold tracking-[0.08em] uppercase text-muted-foreground mb-3"
            >
              {category}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {reports.length > 0 ? (
                reports.map((config) => <ReportCard key={config.type} config={config} />)
              ) : (
                <EmptyCategoryCard category={category} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
