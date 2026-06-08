'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startOfWeek, addWeeks, addDays, subWeeks, format, parseISO } from 'date-fns';

export function useWeekNavigation() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const weekOf = useMemo(() => {
    const param = searchParams.get('weekOf');
    if (param) return param;
    return format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }, [searchParams]);

  const weekLabel = useMemo(() => {
    const start = parseISO(weekOf);
    const end = addDays(start, 6);
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  }, [weekOf]);

  const dayStrings = useMemo(() => {
    const start = parseISO(weekOf);
    return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
  }, [weekOf]);

  const navigateWeek = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      const current = parseISO(weekOf);
      let target: Date;
      if (direction === 'today') {
        target = startOfWeek(new Date(), { weekStartsOn: 1 });
      } else if (direction === 'next') {
        target = addWeeks(current, 1);
      } else {
        target = subWeeks(current, 1);
      }
      const targetStr = format(target, 'yyyy-MM-dd');
      const params = new URLSearchParams(searchParams.toString());
      params.set('weekOf', targetStr);
      router.push(`/dispatcher/horizon?${params.toString()}`);
    },
    [weekOf, searchParams, router],
  );

  const isCurrentWeek = useMemo(() => {
    const currentMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return weekOf === currentMonday;
  }, [weekOf]);

  return { weekOf, weekLabel, dayStrings, navigateWeek, isCurrentWeek };
}
