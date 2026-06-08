'use client';

import { useState } from 'react';
import { ControlPanel } from '@/shared/components/common/dashboard/ControlPanel';
import { VisualizationArea } from '@/shared/components/common/dashboard/VisualizationArea';
import { ResizableSidebar } from '@/shared/components/common/dashboard/ResizableSidebar';
import { useEngineRun } from '@/features/routing/optimization';

export default function RestOptimizerPage() {
  const { mutate: runEngine, isPending } = useEngineRun();

  const [formData, setFormData] = useState({
    driverId: 'DRV-001',
    hoursDriven: '8.5',
    onDutyTime: '10',
    hoursSinceBreak: '6',
    dockDurationHours: '12',
    dockLocation: 'Atlanta Distribution Center',
    remainingDistanceMiles: '150',
    destination: 'Miami, FL',
  });

  const handleRunEngine = () => {
    runEngine({
      driverId: formData.driverId,
      hoursDriven: parseFloat(formData.hoursDriven) || 0,
      onDutyTime: parseFloat(formData.onDutyTime) || 0,
      hoursSinceBreak: parseFloat(formData.hoursSinceBreak) || 0,
      dockDurationHours: formData.dockDurationHours ? parseFloat(formData.dockDurationHours) : undefined,
      dockLocation: formData.dockLocation || undefined,
      remainingDistanceMiles: formData.remainingDistanceMiles ? parseFloat(formData.remainingDistanceMiles) : undefined,
      destination: formData.destination || undefined,
    });
  };

  return (
    <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
      {/* Desktop Resizable Sidebar */}
      <div className="hidden lg:block">
        <ResizableSidebar defaultWidth={340} minWidth={300} maxWidth={700}>
          <ControlPanel
            formData={formData}
            setFormData={setFormData}
            onRunEngine={handleRunEngine}
            isRunning={isPending}
          />
        </ResizableSidebar>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Mobile Control Panel - show as card on mobile */}
        <div className="lg:hidden mb-4">
          <ControlPanel
            formData={formData}
            setFormData={setFormData}
            onRunEngine={handleRunEngine}
            isRunning={isPending}
          />
        </div>
        <VisualizationArea />
      </div>
    </div>
  );
}
