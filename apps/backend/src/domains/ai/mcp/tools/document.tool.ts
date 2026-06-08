import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { BillingReadinessService } from '../../../financials/close-out/billing-readiness.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DOCUMENT_TYPES, formatLoadLabel, getDocumentTypeLabel, DocumentStatusSchema } from '@app/shared-types';

const DOCUMENT_STATUS = DocumentStatusSchema.enum;
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/** Load-uploadable document types derived from the canonical registry. */
const UPLOAD_DOCUMENT_TYPES = Object.entries(DOCUMENT_TYPES)
  .filter(([, config]) => (config.entityTypes as readonly string[]).includes('load'))
  .map(([code]) => code) as [string, ...string[]];

/**
 * Document MCP Tools — compliance checks and document upload via Sally AI chat.
 *
 * Read operations: get-document-compliance (instant, no confirmation)
 * Write operations: request-document-upload (HITL confirmation required)
 *
 * Upload flow:
 * 1. AI calls request-document-upload → validates entity, returns upload context as _card
 * 2. Frontend renders doc_upload card with file picker
 * 3. User picks file → frontend calls existing REST presign/upload/confirm endpoints
 * 4. Card updates to show success
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class DocumentTool {
  private readonly logger = new Logger(DocumentTool.name);

  constructor(
    private readonly billingReadiness: BillingReadinessService,
    private readonly prisma: PrismaService,
  ) {}

  @RequiresScope('documents:read')
  @Tool({
    name: 'get-document-compliance',
    description:
      'Check document compliance for a load. Returns compliance score, whether there are blockers, and a list of document requirements (rate confirmation, BOL, POD) with their status. Provide either loadId (e.g. ld_abc123) or loadNumber (e.g. L-1001).',
    parameters: z.object({
      loadId: z.string().optional().describe('The load ID (e.g. ld_abc123)'),
      loadNumber: z.string().optional().describe('The load number (e.g. L-1001)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getDocumentCompliance({
    loadId,
    loadNumber,
    _tenantId,
  }: {
    loadId?: string;
    loadNumber?: string;
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

    if (!loadId && !loadNumber) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Either loadId or loadNumber is required',
            }),
          },
        ],
      };
    }

    try {
      // Resolve to string loadId for BillingReadinessService
      let resolvedLoadId: string;

      if (loadNumber) {
        const load = await this.prisma.load.findFirst({
          where: { loadNumber, tenantId: _tenantId },
          select: { loadNumber: true },
        });
        if (!load) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `No load found matching load number "${loadNumber}"`,
                }),
              },
            ],
          };
        }
        resolvedLoadId = load.loadNumber;
      } else {
        resolvedLoadId = loadId!;
      }

      const result = await this.billingReadiness.evaluate(resolvedLoadId, _tenantId);

      const documentItems = result.items.filter((i) => i.category === 'document');
      const mappedRequirements = documentItems.map((item) => ({
        documentType: item.type,
        status: item.status,
        enforcement: item.enforcement,
        relatedStopName: item.relatedStopName ?? null,
        reason: item.reason,
        dueBy: item.dueBy ?? null,
        satisfiedBy: item.satisfiedBy
          ? {
              fileName: item.satisfiedBy.fileName,
              uploadedAt: item.satisfiedBy.uploadedAt,
            }
          : null,
      }));

      const cardData = {
        complianceScore: result.score,
        hasBlockers: result.hasBlockers,
        totalRequired: result.totalRequired,
        totalSatisfied: result.totalSatisfied,
        readyToApprove: result.readyToApprove,
        requirements: mappedRequirements,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              complianceScore: result.score,
              hasBlockers: result.hasBlockers,
              totalRequired: result.totalRequired,
              totalSatisfied: result.totalSatisfied,
              readyToApprove: result.readyToApprove,
              requirements: mappedRequirements,
            }),
          },
        ],
        _card: { type: 'doc_compliance' as const, data: cardData },
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: e?.message ?? `Failed to check document compliance for ${loadId ?? loadNumber}`,
            }),
          },
        ],
      };
    }
  }

  @RequiresScope('documents:write')
  @Tool({
    name: 'request-document-upload',
    description: `Request a document upload for a load. Validates the load exists and returns an upload card so the user can pick a file and upload it directly in chat. Supported document types: ${UPLOAD_DOCUMENT_TYPES.join(', ')}. IMPORTANT: Always confirm with the user before calling this tool. Tell them which load and document type you are about to initiate the upload for, and ask for explicit confirmation.`,
    parameters: z.object({
      loadId: z.string().optional().describe('The load ID (e.g. ld_abc123)'),
      loadNumber: z.string().optional().describe('The load number (e.g. LD-20260330-001)'),
      documentType: z
        .enum(UPLOAD_DOCUMENT_TYPES)
        .describe(`Type of document to upload: ${UPLOAD_DOCUMENT_TYPES.join(', ')}`),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async requestDocumentUpload({
    loadId,
    loadNumber,
    documentType,
    _tenantId,
    _userId,
  }: {
    loadId?: string;
    loadNumber?: string;
    documentType: string;
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

    if (!loadId && !loadNumber) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Either loadId or loadNumber is required. Ask the user which load the document belongs to.',
            }),
          },
        ],
      };
    }

    try {
      // Resolve load
      const load = loadNumber
        ? await this.prisma.load.findFirst({
            where: { loadNumber, tenantId: _tenantId },
            select: {
              id: true,
              loadNumber: true,
              referenceNumber: true,
            },
          })
        : await this.prisma.load.findFirst({
            where: { loadNumber: loadId, tenantId: _tenantId },
            select: {
              id: true,
              loadNumber: true,
              referenceNumber: true,
            },
          });

      if (!load) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `No load found matching "${loadNumber ?? loadId}" for this tenant. Ask the user to verify the load number.`,
              }),
            },
          ],
        };
      }

      // Check for existing documents of the same type
      const existingDocs = await this.prisma.document.findMany({
        where: {
          entityType: 'load',
          entityId: load.id,
          documentType,
          tenantId: _tenantId,
          status: DOCUMENT_STATUS.CONFIRMED,
        },
        select: { id: true, fileName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });

      const docTypeLabel = getDocumentTypeLabel(documentType);
      const loadLabel = formatLoadLabel(load.loadNumber, load.referenceNumber);

      const cardData = {
        entityType: 'load' as const,
        entityId: load.id,
        loadNumber: load.loadNumber,
        loadLabel,
        documentType,
        documentTypeLabel: docTypeLabel,
        existingCount: existingDocs.length,
      };

      const responseText =
        existingDocs.length > 0
          ? `Ready for ${docTypeLabel} upload for ${loadLabel}. Note: ${existingDocs.length} existing ${docTypeLabel} document(s) found — this will add another. Use the upload area below to select your file.`
          : `Ready for ${docTypeLabel} upload for ${loadLabel}. Use the upload area below to select your file.`;

      this.logger.log(
        `Document upload requested: ${documentType} for load ${load.loadNumber} (tenant ${_tenantId}, user ${_userId ?? 'unknown'})`,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              loadNumber: load.loadNumber,
              loadLabel,
              documentType,
              existingDocCount: existingDocs.length,
              message: responseText,
            }),
          },
        ],
        _card: { type: 'doc_upload' as const, data: cardData },
      };
    } catch (e: any) {
      this.logger.error(`Failed to request document upload: ${e.message}`, e.stack);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: e?.message ?? 'Failed to prepare document upload. Please try again.',
            }),
          },
        ],
      };
    }
  }
}
