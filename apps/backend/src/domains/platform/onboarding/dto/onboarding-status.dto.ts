export interface OnboardingItem {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  statusText: string;
  actionLink: string;
  actionType: 'link' | 'chat' | 'sheet' | 'console';
}

export interface LoadPath {
  id: string;
  title: string;
  description: string;
  actionLink: string;
  actionType: 'link' | 'sheet' | 'dialog' | 'console';
}

export interface MilestoneStatus {
  id: string;
  title: string;
  subtitle: string;
  status: 'complete' | 'in_progress' | 'available';
  unlockMessage: string;
  items: OnboardingItem[];
  loadPaths?: LoadPath[];
}

export interface OnboardingStatusResponse {
  overallProgress: number;
  completedItems: number;
  totalItems: number;
  milestones: MilestoneStatus[];
}
