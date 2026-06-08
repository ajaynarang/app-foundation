import { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { showError } from '@sally/ui';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { useShieldAuditHistory } from '@/features/operations/shield/hooks/use-shield';
import { downloadAuditPdf } from '@/features/operations/shield/utils/download-pdf';
import { DateRangeFilter, HISTORY_PRESETS } from '@/shared/components/ui/date-range-filter';

/**
 * Compliance Trend — Phase B of the workspace ↔ insights split. The
 * Shield page used to render this inline as a "History" tab. It was
 * report-shaped (chart + audit list with PDF export), so it moved to
 * Insights. The Shield page links here from a header pill.
 */
export function ComplianceTrendReport() {
  const { formatTimestamp } = useFormatters();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const { data: historyData, isLoading } = useShieldAuditHistory(100, 0, dateFrom, dateTo);

  const chartData = useMemo(() => {
    if (!historyData?.audits) return [];
    return historyData.audits
      .filter((a) => a.status === 'COMPLETED' && a.overallScore != null)
      .reverse()
      .map((a) => ({
        date: formatTimestamp(a.completedAt, DISPLAY_FORMATS.COMPACT),
        score: a.overallScore,
      }));
  }, [historyData, formatTimestamp]);

  return (
    <div className="space-y-6">
      <div>
        <DateRangeFilter
          dateFrom={dateFrom}
          dateTo={dateTo}
          defaultPreset="7d"
          presets={HISTORY_PRESETS}
          onChange={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      ) : (
        <>
          {chartData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Score Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="currentColor" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="currentColor" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                    <RechartsTooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke="currentColor"
                      fill="url(#scoreGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Past Audits</CardTitle>
            </CardHeader>
            <CardContent>
              {!historyData?.audits || historyData.audits.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No audit history yet.</p>
              ) : (
                <div className="space-y-2">
                  {historyData.audits.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground min-w-[90px]">
                          {a.completedAt
                            ? formatTimestamp(a.completedAt, DISPLAY_FORMATS.COMPACT_DATE_TIME)
                            : formatTimestamp(a.createdAt, DISPLAY_FORMATS.COMPACT)}
                        </span>
                        <span
                          className={`text-sm font-semibold ${
                            a.overallScore != null
                              ? a.overallScore >= 90
                                ? SEMANTIC_COLORS.neutral.text
                                : a.overallScore >= 70
                                  ? SEMANTIC_COLORS.caution.text
                                  : SEMANTIC_COLORS.critical.text
                              : SEMANTIC_COLORS.neutral.text
                          }`}
                        >
                          {a.overallScore ?? '—'}
                        </span>
                        <Badge variant="outline" className="text-2xs">
                          {a.scope}
                        </Badge>
                        <Badge variant="outline" className="text-2xs">
                          {a.triggeredBy}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{a._count?.findings ?? 0} findings</span>
                        {a.status === 'COMPLETED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={downloadingId === a.id}
                            onClick={async () => {
                              setDownloadingId(a.id);
                              try {
                                await downloadAuditPdf(a.id);
                              } catch {
                                showError('Failed to download PDF');
                              } finally {
                                setDownloadingId(null);
                              }
                            }}
                          >
                            {downloadingId === a.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
