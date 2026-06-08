import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Custom Field Query MCP Tool — read-only tool for discovering custom field definitions.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class CustomFieldQueryTool {
  constructor(private readonly prisma: PrismaService) {}

  @RequiresScope('fleet:read')
  @Tool({
    name: 'get-custom-field-definitions',
    description:
      'Get the custom field definitions configured for a given entity type (LOAD, DRIVER, VEHICLE, or CUSTOMER). Use this before setting custom field values to discover available field keys, types, and options. Returns only active definitions.',
    parameters: z.object({
      entityType: z
        .enum(['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER'])
        .describe('Entity type to get custom field definitions for'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
    }),
  })
  async getCustomFieldDefinitions({
    entityType,
    _tenantId,
  }: {
    entityType: 'LOAD' | 'DRIVER' | 'VEHICLE' | 'CUSTOMER';
    _tenantId?: number;
  }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context available' }),
          },
        ],
      };
    }

    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: {
        tenantId: _tenantId,
        entityType,
        isActive: true,
      },
      select: {
        name: true,
        fieldKey: true,
        fieldType: true,
        options: true,
        isRequired: true,
        driverEditable: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            entityType,
            count: definitions.length,
            definitions,
          }),
        },
      ],
    };
  }
}
