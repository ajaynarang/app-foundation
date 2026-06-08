import { redirect } from 'next/navigation';

export default async function CustomerDetailRedirect({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  redirect(`/dispatcher/network/customers/${customerId}`);
}
