import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { nestApp } from './nest-context';

/**
 * The tenant that owns an episode, or null when the episode is not there (or, once row-level security is enforced,
 * owned by another tenant). Its own module so workflow specs can stub it without a Nest container.
 */
export async function loadEpisodeTenantId(episodeId: string): Promise<number | null> {
  const prisma = nestApp().get(PrismaService);
  const row = await prisma.deskEpisode.findUnique({ where: { id: episodeId }, select: { tenantId: true } });
  return row?.tenantId ?? null;
}
