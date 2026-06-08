import { redirect } from 'next/navigation';

export default function SubscriptionRedirect() {
  redirect('/settings/subscription');
}
