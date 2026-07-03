import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../constants/storage-keys';

export const SHEET_SIZE_MODE_OPTIONS = ['side-panel', 'half', 'full'] as const;
export type SheetSizeMode = (typeof SHEET_SIZE_MODE_OPTIONS)[number];

interface SheetSizeState {
  sizes: Record<string, SheetSizeMode>;
  setSize: (entityType: string, size: SheetSizeMode) => void;
}

export const useSheetSizeStore = create<SheetSizeState>()(
  persist(
    (set) => ({
      sizes: {},
      setSize: (entityType: string, size: SheetSizeMode) =>
        set((state) => ({
          sizes: { ...state.sizes, [entityType]: size },
        })),
    }),
    {
      name: STORAGE_KEYS.SHEET_SIZES,
    },
  ),
);
