'use client';

import { createContext, useContext, useMemo, useEffect } from 'react';
import { DEFAULT_TENANT_TIMEZONE } from '@app/shared-types';
import { usePreferencesStore } from '@/features/platform/settings';
import { useAuthStore } from '@/features/auth';
import {
  formatDistance as rawFormatDistance,
  formatTime as rawFormatTime,
  formatDate as rawFormatDate,
  formatDateTime as rawFormatDateTime,
  formatCurrency as rawFormatCurrency,
  formatCents as rawFormatCents,
} from '@/shared/lib/utils/formatters';
import {
  formatCalendarDate as rawFormatCalendarDate,
  formatTimestamp as rawFormatTimestamp,
  formatTimestampDate as rawFormatTimestampDate,
  isCalendarDateBefore,
  calendarDateToDate as rawCalendarDateToDate,
  dateToCalendarDate as rawDateToCalendarDate,
} from '@/shared/lib/utils/date-utils';

interface Formatters {
  formatDistance: (miles: number) => string;
  formatTime: (date: Date | string) => string;
  formatDate: (date: Date | string) => string;
  formatDateTime: (date: Date | string) => string;
  formatCurrency: (amount: number) => string;
  formatCents: (cents: number) => string;
  formatCalendarDate: (dateStr: string | null | undefined, fmt?: string) => string;
  formatTimestamp: (isoString: string | null | undefined, fmt?: string) => string;
  formatTimestampDate: (isoString: string | null | undefined, fmt?: string) => string;
  isCalendarDateOverdue: (dateStr: string) => boolean;
  calendarDateToDate: (dateStr: string) => Date;
  dateToCalendarDate: (date: Date) => string;
  distanceUnit: 'MILES' | 'KILOMETERS';
  timeFormat: '12H' | '24H';
  dateFormat: string;
  timezone: string;
}

function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

const defaults: Formatters = {
  formatDistance: (miles) => rawFormatDistance(miles, 'MILES'),
  formatTime: (date) => rawFormatTime(toDate(date), '12H'),
  formatDate: (date) => rawFormatDate(toDate(date), 'MM/DD/YYYY'),
  formatDateTime: (date) => rawFormatDateTime(toDate(date), 'MM/DD/YYYY', '12H'),
  formatCurrency: (amount) => rawFormatCurrency(amount, 'USD'),
  formatCents: (cents) => rawFormatCents(cents, 'USD'),
  formatCalendarDate: (dateStr) => rawFormatCalendarDate(dateStr, 'MM/DD/YYYY'),
  formatTimestamp: (isoString) => rawFormatTimestamp(isoString, DEFAULT_TENANT_TIMEZONE),
  formatTimestampDate: (isoString) => rawFormatTimestampDate(isoString, DEFAULT_TENANT_TIMEZONE),
  isCalendarDateOverdue: (dateStr) => isCalendarDateBefore(dateStr, DEFAULT_TENANT_TIMEZONE),
  calendarDateToDate: rawCalendarDateToDate,
  dateToCalendarDate: rawDateToCalendarDate,
  distanceUnit: 'MILES',
  timeFormat: '12H',
  dateFormat: 'MM/DD/YYYY',
  timezone: DEFAULT_TENANT_TIMEZONE,
};

const PreferencesContext = createContext<Formatters>(defaults);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { userPreferences, loadAllPreferences } = usePreferencesStore();
  const { user } = useAuthStore();

  useEffect(() => {
    if (user) {
      loadAllPreferences(user.role);
    }
  }, [user, loadAllPreferences]);

  const formatters = useMemo<Formatters>(() => {
    const du = (userPreferences?.distanceUnit as 'MILES' | 'KILOMETERS') || 'MILES';
    const tf = (userPreferences?.timeFormat as '12H' | '24H') || '12H';
    const df = userPreferences?.dateFormat || 'MM/DD/YYYY';
    const tz = userPreferences?.timezone || user?.tenantTimezone || DEFAULT_TENANT_TIMEZONE;

    return {
      formatDistance: (miles) => rawFormatDistance(miles, du),
      formatTime: (date) => rawFormatTime(toDate(date), tf),
      formatDate: (date) => rawFormatDate(toDate(date), df),
      formatDateTime: (date) => rawFormatDateTime(toDate(date), df, tf),
      formatCurrency: (amount) => rawFormatCurrency(amount, 'USD'),
      formatCents: (cents) => rawFormatCents(cents, 'USD'),
      formatCalendarDate: (dateStr, fmt) => rawFormatCalendarDate(dateStr, fmt ?? df),
      formatTimestamp: (isoString, fmt) => rawFormatTimestamp(isoString, tz, fmt),
      formatTimestampDate: (isoString, fmt) => rawFormatTimestampDate(isoString, tz, fmt),
      isCalendarDateOverdue: (dateStr) => isCalendarDateBefore(dateStr, tz),
      calendarDateToDate: rawCalendarDateToDate,
      dateToCalendarDate: rawDateToCalendarDate,
      distanceUnit: du,
      timeFormat: tf,
      dateFormat: df,
      timezone: tz,
    };
  }, [
    userPreferences?.distanceUnit,
    userPreferences?.timeFormat,
    userPreferences?.dateFormat,
    userPreferences?.timezone,
    user?.tenantTimezone,
  ]);

  return <PreferencesContext.Provider value={formatters}>{children}</PreferencesContext.Provider>;
}

export function useFormatters() {
  return useContext(PreferencesContext);
}
