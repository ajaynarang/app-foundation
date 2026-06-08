// API
export { vehiclesApi, listVehicles, getVehicle, createVehicle, updateVehicle } from './api';

// Types
export type { Vehicle, CreateVehicleRequest, UpdateVehicleRequest, VehicleStatus, EquipmentType } from './types';

// Hooks
export {
  useVehicles,
  useVehicleById,
  useCreateVehicle,
  useUpdateVehicle,
  useDeactivateVehicle,
  useReactivateVehicle,
  useDecommissionVehicle,
} from './hooks/use-vehicles';

// Components
export { default as VehicleDetailSheet } from './components/vehicle-detail-sheet';
export { default as EditVehicleSheet } from './components/edit-vehicle-sheet';
