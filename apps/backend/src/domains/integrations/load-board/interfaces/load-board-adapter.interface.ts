import type { LoadBoardSearchParams, LoadBoardSearchResult, LoadBoardListing } from '@sally/shared-types';

export interface ILoadBoardAdapter {
  readonly providerId: string;

  search(params: LoadBoardSearchParams, credentials: Record<string, string>): Promise<LoadBoardSearchResult>;

  getListingDetail(externalId: string, credentials: Record<string, string>): Promise<LoadBoardListing>;

  testConnection(credentials: Record<string, string>): Promise<boolean>;
}
