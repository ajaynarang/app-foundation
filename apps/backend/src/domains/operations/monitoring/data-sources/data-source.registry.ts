import { Injectable } from '@nestjs/common';
import { DataSourceDefinition } from '../monitoring.types';
import { ALL_DATA_SOURCES } from './sources';

@Injectable()
export class DataSourceRegistry {
  private sources: Map<string, DataSourceDefinition>;

  constructor() {
    this.sources = new Map(ALL_DATA_SOURCES.map((s) => [s.id, s]));
  }

  getAll(): DataSourceDefinition[] {
    return Array.from(this.sources.values());
  }

  getById(id: string): DataSourceDefinition | undefined {
    return this.sources.get(id);
  }

  getSourcesProvidingCapability(capability: string): DataSourceDefinition[] {
    return this.getAll().filter((s) => s.provides.includes(capability));
  }

  getAllCapabilities(): string[] {
    const caps = new Set<string>();
    for (const source of this.sources.values()) {
      source.provides.forEach((p) => caps.add(p));
    }
    return Array.from(caps);
  }
}
