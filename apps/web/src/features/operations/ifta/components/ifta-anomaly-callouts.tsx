'use client';

import { Card, CardContent } from '@sally/ui/components/ui/card';
import { AlertTriangle, XCircle, Info } from 'lucide-react';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { IftaAnomaly } from '../types';

const SEVERITY_CONFIG = {
  CRITICAL: {
    icon: XCircle,
    color: SEMANTIC_COLORS.critical,
  },
  WARNING: {
    icon: AlertTriangle,
    color: SEMANTIC_COLORS.caution,
  },
  INFO: {
    icon: Info,
    color: SEMANTIC_COLORS.info,
  },
} as const;

interface IftaAnomalyCalloutsProps {
  anomalies: IftaAnomaly[];
}

export function IftaAnomalyCallouts({ anomalies }: IftaAnomalyCalloutsProps) {
  if (!anomalies.length) return null;

  return (
    <div className="space-y-2">
      {anomalies.map((anomaly, idx) => {
        const config = SEVERITY_CONFIG[anomaly.severity] ?? SEVERITY_CONFIG.INFO;
        const Icon = config.icon;
        const colors = config.color;

        return (
          <Card key={`${anomaly.type}-${idx}`} className={`border-l-4 ${colors.borderL} ${colors.bg}`}>
            <CardContent className="p-3 flex items-start gap-3">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${colors.text}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{anomaly.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{anomaly.description}</p>
                {anomaly.recommendation && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{anomaly.recommendation}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
