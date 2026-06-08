import { PrismaService } from '../../../../infrastructure/database/prisma.service';

/** MCP tool return shape. */
export interface McpToolResult {
  content: { type: 'text'; text: string }[];
}

/**
 * Shared utilities for driver-scoped MCP tools.
 *
 * Identity resolution: `_userId` (JWT) → `User.driverId`.
 * The AI never controls driver identity — it comes from the authenticated session.
 */
export class DriverToolUtils {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the authenticated user's linked driver ID.
   * Returns null if the user has no linked driver profile.
   */
  async resolveDriverId(userId: string): Promise<number | null> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { driverId: true },
    });
    return user?.driverId ?? null;
  }

  /** Error: no authenticated session (missing JWT userId). */
  static noSessionError(): McpToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'No authenticated session found. Please log in and try again.',
          }),
        },
      ],
    };
  }

  /** Error: user account is not linked to a driver profile. */
  static noDriverError(): McpToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            error: 'Your account is not linked to a driver profile. Contact your dispatcher.',
          }),
        },
      ],
    };
  }

  /** Error: no active route found. */
  static noRouteError(): McpToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: 'No active route found' }),
        },
      ],
    };
  }
}
