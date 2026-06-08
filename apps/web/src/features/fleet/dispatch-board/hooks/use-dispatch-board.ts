import { useQuery } from '@tanstack/react-query';
import { dispatchBoardApi } from '../api';
import type { DispatchBoardFilters } from '../types';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { queryKeys } from '@/shared/constants';

export function useDispatchBoard(filters?: DispatchBoardFilters) {
  return useQuery({
    queryKey: [...queryKeys.dispatchBoard.root, filters],
    queryFn: () => dispatchBoardApi.getBoard(filters),
    ...QUERY_TIERS.OPERATIONAL,
  });
}
