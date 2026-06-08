import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { ShieldService } from '../../../operations/shield/services/shield.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Shield Compliance MCP Tools — query compliance scores, findings, and trigger audits.
 *
 * Read operations: get-shield-score, get-shield-findings (instant, no confirmation)
 * Write operations: trigger-shield-audit (requires HITL confirmation)
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class ShieldTool {
  constructor(private readonly shieldService: ShieldService) {}

  @RequiresScope('shield:read')
  @Tool({
    name: 'get-shield-score',
    description:
      'Get the current Shield compliance scores for the tenant. Returns overall score, category scores (HOS, Drivers, Vehicles, Loads), status label (PROTECTED, AT_RISK, VULNERABLE), and last audit timestamp.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getShieldScore({ _tenantId }: { _tenantId?: number; _userId?: string }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context' }),
          },
        ],
      };
    }

    const scores = await this.shieldService.getLatestScores(_tenantId);

    const cardData = {
      overallScore: scores.overallScore ?? 0,
      hosScore: scores.hosScore ?? 0,
      driversScore: scores.driversScore ?? 0,
      vehiclesScore: scores.vehiclesScore ?? 0,
      loadsScore: scores.loadsScore ?? 0,
      statusLabel: scores.statusLabel ?? 'N/A',
      lastAuditAt: scores.completedAt?.toISOString() ?? null,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(cardData),
        },
      ],
      _card: { type: 'shield' as const, data: cardData },
    };
  }

  @RequiresScope('shield:read')
  @Tool({
    name: 'get-shield-findings',
    description:
      'Get Shield compliance findings filtered by category (HOS, DRIVERS, VEHICLES, LOADS) and/or severity (CRITICAL, WARNING, INFO, PASSED). Returns up to 100 findings sorted by severity then recency.',
    parameters: z.object({
      category: z.enum(['HOS', 'DRIVERS', 'VEHICLES', 'LOADS']).optional().describe('Filter by finding category'),
      severity: z.enum(['CRITICAL', 'WARNING', 'INFO', 'PASSED']).optional().describe('Filter by severity level'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getShieldFindings({
    category,
    severity,
    _tenantId,
  }: {
    category?: string;
    severity?: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context' }),
          },
        ],
      };
    }

    const findings = await this.shieldService.getFindings(_tenantId, {
      category,
      severity,
      isResolved: false,
    });

    const mapped = findings.map((f) => ({
      severity: f.severity,
      title: f.title,
      entityName: f.entityName ?? null,
      recommendation: f.recommendation ?? null,
    }));

    const cardData = {
      findings: mapped,
      totalCount: mapped.length,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: mapped.length,
            findings: mapped,
          }),
        },
      ],
      _card: { type: 'shield_findings' as const, data: cardData },
    };
  }

  @RequiresScope('shield:write')
  @Tool({
    name: 'trigger-shield-audit',
    description:
      'Trigger a new Shield compliance audit, queuing a background job to re-evaluate compliance across the specified categories. Use when the dispatcher says "run a compliance audit" or "re-check our Shield score." Do NOT use just to view current findings — use get-shield-findings. Requires user confirmation before executing.',
    parameters: z.object({
      scope: z
        .enum(['FULL', 'HOS', 'DRIVERS', 'VEHICLES', 'LOADS'])
        .optional()
        .default('FULL')
        .describe('Audit scope: FULL runs all categories, or pick a single category'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
      _conversationId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async triggerShieldAudit({
    scope,
    _tenantId,
    _userId,
    _conversationId,
  }: {
    scope?: 'FULL' | 'HOS' | 'DRIVERS' | 'VEHICLES' | 'LOADS';
    _tenantId?: number;
    _userId?: string;
    _conversationId?: string;
  }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context' }),
          },
        ],
      };
    }

    try {
      const result = await this.shieldService.triggerAudit({
        tenantId: _tenantId,
        scope: scope ?? 'FULL',
        includeAi: true,
        triggeredBy: 'MANUAL',
        triggeredById: _userId ? parseInt(_userId, 10) : undefined,
        conversationId: _conversationId,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: result.queued,
              auditId: result.auditId,
              message: result.queued
                ? `Shield audit queued (scope: ${scope ?? 'FULL'}). Results will be available shortly.`
                : (result.message ?? 'An audit is already in progress'),
            }),
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: e.message }),
          },
        ],
      };
    }
  }
}
