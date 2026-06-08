# Shared Utilities

This directory contains reusable utility functions used throughout the application.

## 📁 Files

- **`cn.ts`** - Tailwind CSS class name merging utility
- **`formatters.ts`** - Display formatters for dates, times, distances, currencies, etc.
- **`validation.ts`** - Validation utilities
- **`index.ts`** - Re-exports all utilities for easy importing

## 🎨 Formatters

### Date & Time Formatting

#### `formatDateTimeFriendly(date: Date | string): string`
Format a date/time in a readable format: **"Jan 15, 2024, 3:45 PM"**

```typescript
import { formatDateTimeFriendly } from '@/shared/lib/utils';

formatDateTimeFriendly(new Date());                    // "Jan 15, 2024, 3:45 PM"
formatDateTimeFriendly("2024-01-15T15:45:00Z");       // "Jan 15, 2024, 3:45 PM"
```

**Use cases:**
- Audit logs and timestamps
- Tenant approval/suspension dates
- User last login times
- Any date+time display in the UI

#### `formatDateFriendly(date: Date | string): string`
Format just the date portion: **"Jan 15, 2024"**

```typescript
import { formatDateFriendly } from '@/shared/lib/utils';

formatDateFriendly(new Date());              // "Jan 15, 2024"
formatDateFriendly("2024-01-15");           // "Jan 15, 2024"
```

**Use cases:**
- Birth dates
- Start/end dates without time
- Date-only fields

#### `formatTimeFriendly(date: Date | string): string`
Format just the time portion: **"3:45 PM"**

```typescript
import { formatTimeFriendly } from '@/shared/lib/utils';

formatTimeFriendly(new Date());                    // "3:45 PM"
formatTimeFriendly("2024-01-15T15:45:00Z");       // "3:45 PM"
```

**Use cases:**
- Appointment times
- Delivery windows
- Time-only displays

#### `formatRelativeTime(date: Date | string): string`
Format as relative time: **"2 hours ago"**, **"in 3 days"**

```typescript
import { formatRelativeTime } from '@/shared/lib/utils';

formatRelativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000));  // "2 hours ago"
formatRelativeTime(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));  // "in 3 days"
```

**Use cases:**
- Activity feeds
- Recent actions
- "Last seen" indicators

#### `formatDate(date: Date, format?: string): string`
Legacy formatter with configurable format (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD)

#### `formatTime(date: Date, format?: '12H' | '24H'): string`
Legacy formatter for time with 12h/24h support

#### `formatDateTime(date: Date, dateFormat?: string, timeFormat?: '12H' | '24H'): string`
Legacy formatter combining date and time

### Distance Formatting

#### `formatDistance(miles: number, unit?: 'MILES' | 'KILOMETERS'): string`

```typescript
formatDistance(100, 'MILES');        // "100.0 mi"
formatDistance(100, 'KILOMETERS');   // "160.9 km"
```

### Currency Formatting

#### `formatCurrency(amount: number, currency?: string): string`

```typescript
formatCurrency(1250.50);            // "$1,250.50"
formatCurrency(1250.50, 'EUR');     // "€1,250.50"
```

### Duration Formatting

#### `formatDuration(hours: number): string`

```typescript
formatDuration(2.5);    // "2h 30m"
formatDuration(0.25);   // "15m"
formatDuration(3);      // "3h"
```

### Weight Formatting

#### `formatWeight(lbs: number, system?: 'US' | 'METRIC'): string`

```typescript
formatWeight(5000, 'US');       // "5000 lbs"
formatWeight(5000, 'METRIC');   // "2268 kg"
```

### Temperature Formatting

#### `formatTemperature(fahrenheit: number, unit?: 'F' | 'C'): string`

```typescript
formatTemperature(72, 'F');     // "72.0°F"
formatTemperature(72, 'C');     // "22.2°C"
```

### Fuel Formatting

#### `formatFuelVolume(gallons: number, system?: 'US' | 'METRIC'): string`

```typescript
formatFuelVolume(50, 'US');       // "50.0 gal"
formatFuelVolume(50, 'METRIC');   // "189.3 L"
```

#### `formatFuelPrice(pricePerGallon: number, currency?: string, system?: 'US' | 'METRIC'): string`

```typescript
formatFuelPrice(3.50, 'USD', 'US');       // "$3.50/gal"
formatFuelPrice(3.50, 'USD', 'METRIC');   // "$0.92/L"
```

### Percentage Formatting

#### `formatPercentage(value: number, decimals?: number): string`

```typescript
formatPercentage(75);       // "75%"
formatPercentage(75.5, 1);  // "75.5%"
```

## 🎯 Best Practices

### ✅ DO

```typescript
// Use formatDateTimeFriendly for most timestamp displays
<span>{formatDateTimeFriendly(tenant.approvedAt)}</span>

// Import from the barrel export
import { formatDateTimeFriendly, formatCurrency } from '@/shared/lib/utils';

// Handle null/undefined gracefully
{user.lastLoginAt ? formatDateTimeFriendly(user.lastLoginAt) : 'Never'}
```

### ❌ DON'T

```typescript
// Don't create inline formatters
const formatDate = (date) => new Date(date).toLocaleDateString(); // ❌

// Don't use raw toLocaleDateString without formatters
<span>{new Date(tenant.approvedAt).toLocaleDateString()}</span> // ❌

// Don't import from the specific file
import { formatDateTimeFriendly } from '@/shared/lib/utils/formatters'; // ❌ verbose
```

## 🏗️ Architecture Notes

- All formatters accept both `Date` objects and ISO date strings for flexibility
- Formatters use `Intl` APIs for internationalization support
- Default to US locale and formats (can be extended for i18n later)
- All distance/weight/temp conversions use standard conversion factors
- Formatters are pure functions with no side effects

## 📚 Adding New Formatters

When adding a new formatter:

1. Add it to `formatters.ts`
2. Add JSDoc comments with examples
3. Export it from `formatters.ts` (it will auto-export via `index.ts`)
4. Document it in this README
5. Write examples in the JSDoc

Example:

```typescript
/**
 * Format a thing in a specific way
 * @param input - The input value
 * @returns Formatted string
 * 
 * @example
 * formatThing(123) // "123 things"
 */
export function formatThing(input: number): string {
  return `${input} things`;
}
```
