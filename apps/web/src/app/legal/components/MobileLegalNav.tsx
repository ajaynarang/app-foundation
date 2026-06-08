'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { legalPages } from '../constants';

export function MobileLegalNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Select value={pathname ?? undefined} onValueChange={(value) => router.push(value)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select page" />
      </SelectTrigger>
      <SelectContent>
        {legalPages.map((page) => (
          <SelectItem key={page.href} value={page.href}>
            {page.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
