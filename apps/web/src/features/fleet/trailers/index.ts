// API
export { trailersApi } from './api';

// Types
export type {
  Trailer,
  TrailerStatus,
  TrailerLifecycleStatus,
  OwnershipType,
  CreateTrailerRequest,
  UpdateTrailerRequest,
} from './types';

// Hooks
export {
  useTrailers,
  useTrailerById,
  useCreateTrailer,
  useUpdateTrailer,
  useDeactivateTrailer,
  useReactivateTrailer,
  useDecommissionTrailer,
  useAssignVehicle,
  useUnassignVehicle,
} from './hooks/use-trailers';

// Components
export { default as TrailerDetailSheet } from './components/trailer-detail-sheet';
export { default as CreateTrailerSheet } from './components/create-trailer-sheet';
export { default as EditTrailerSheet } from './components/edit-trailer-sheet';
export { TrailerStatusBadge } from './components/trailer-status-badge';
