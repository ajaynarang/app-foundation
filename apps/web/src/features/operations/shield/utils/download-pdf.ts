export async function downloadAuditPdf(auditId: string) {
  const { useAuthStore } = await import('@/features/auth');
  const accessToken = useAuthStore.getState().accessToken;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const url = `${apiBase}/shield/audits/${auditId}/export`;

  const res = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'include',
  });

  if (!res.ok) throw new Error('Failed to download PDF');

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `shield-audit-${auditId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
