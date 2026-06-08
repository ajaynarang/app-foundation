import type { Metadata } from 'next';
import { OverviewCards } from '../../../components/overview-cards';
import { QuickActions } from '../../../components/quick-actions';
import { AttentionItems } from '../../../components/attention-items';

export const metadata: Metadata = {
  title: 'Overview',
};

export default function OverviewPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="mt-1 text-muted-foreground">Your platform at a glance</p>
      </div>
      <OverviewCards />
      <QuickActions />
      <AttentionItems />
    </div>
  );
}
