import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallySuggestion } from '../horizon.types';
/** Parse YYYY-MM-DD to a Date at UTC midnight — safe for @db.Date columns */
function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export interface OpenSlot {
  driverId: number;
  date: string;
  driverCity: string | null;
  driverState: string | null;
  equipmentType: string | null;
}

@Injectable()
export class SallySuggestionsService {
  private readonly logger = new Logger(SallySuggestionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generate(
    tenantId: number,
    openSlots: OpenSlot[],
    weekStart: string,
    weekEnd: string,
  ): Promise<{ message: string; suggestions: SallySuggestion[] }> {
    if (openSlots.length === 0) {
      return {
        message: 'All drivers are fully loaded this week.',
        suggestions: [],
      };
    }

    const unassignedLoads = await this.prisma.load.findMany({
      where: {
        tenantId,
        driverId: null,
        status: 'PENDING',
        pickupDate: {
          gte: parseDateOnly(weekStart),
          lte: parseDateOnly(weekEnd),
        },
      },
    });

    if (unassignedLoads.length === 0) {
      return {
        message: `${openSlots.length} open driver-days this week. No unassigned loads found to suggest.`,
        suggestions: [],
      };
    }

    const matches: Array<SallySuggestion & { rawScore: number }> = [];
    for (const slot of openSlots) {
      for (const load of unassignedLoads) {
        const score = this.scoreMatch(slot, load);
        if (score >= 70) {
          matches.push({
            suggestionId: `s-${slot.driverId}-${load.loadNumber}-${slot.date}`,
            driverId: slot.driverId,
            loadNumber: load.loadNumber,
            referenceNumber: load.referenceNumber ?? null,
            route: `${load.originCity} → ${load.destinationCity}`,
            matchScore: score,
            date: slot.date,
            reason: this.buildReason(slot, load),
            rawScore: score,
          });
        }
      }
    }

    // Sort by score descending, deduplicate (one suggestion per load)
    matches.sort((a, b) => b.rawScore - a.rawScore);
    const seenLoads = new Set<string>();
    const suggestions: SallySuggestion[] = [];
    for (const match of matches) {
      if (seenLoads.has(match.loadNumber)) continue;
      seenLoads.add(match.loadNumber);
      const { rawScore: _rawScore, ...suggestion } = match;
      suggestions.push(suggestion);
      if (suggestions.length >= 5) break;
    }

    const message = `${openSlots.length} open driver-days this week. Found ${suggestions.length} load${suggestions.length === 1 ? '' : 's'} on preferred lanes.`;

    return { message, suggestions };
  }

  private scoreMatch(slot: OpenSlot, load: any): number {
    // Equipment match is a hard filter
    if (
      slot.equipmentType &&
      load.requiredEquipmentType &&
      slot.equipmentType.toLowerCase() !== load.requiredEquipmentType.toLowerCase()
    ) {
      return 0;
    }

    let score = 50; // base

    // Equipment match bonus: +15
    if (
      slot.equipmentType &&
      load.requiredEquipmentType &&
      slot.equipmentType.toLowerCase() === load.requiredEquipmentType.toLowerCase()
    ) {
      score += 15;
    }

    // Proximity: +25 if same city/state
    if (slot.driverCity && load.originCity) {
      if (
        slot.driverCity.toLowerCase() === load.originCity.toLowerCase() &&
        slot.driverState?.toLowerCase() === load.originState?.toLowerCase()
      ) {
        score += 25;
      } else if (slot.driverState?.toLowerCase() === load.originState?.toLowerCase()) {
        score += 10;
      }
    }

    // Date fit: +10 if pickup date matches open slot date
    const pickupStr =
      load.pickupDate instanceof Date ? load.pickupDate.toISOString().slice(0, 10) : String(load.pickupDate);
    if (pickupStr === slot.date) {
      score += 10;
    }

    return Math.min(score, 99);
  }

  private buildReason(slot: OpenSlot, load: any): string {
    const reasons: string[] = [];
    if (
      slot.equipmentType &&
      load.requiredEquipmentType &&
      slot.equipmentType.toLowerCase() === load.requiredEquipmentType.toLowerCase()
    ) {
      reasons.push('Equipment match');
    }
    if (
      slot.driverCity?.toLowerCase() === load.originCity?.toLowerCase() &&
      slot.driverState?.toLowerCase() === load.originState?.toLowerCase()
    ) {
      reasons.push('Driver in position');
    } else if (slot.driverState?.toLowerCase() === load.originState?.toLowerCase()) {
      reasons.push('Same state');
    }
    return reasons.join(', ') || 'Available driver';
  }
}
