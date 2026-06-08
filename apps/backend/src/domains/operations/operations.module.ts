import { Module } from '@nestjs/common';
import { AlertsModule } from './alerts/alerts.module';
import { InAppNotificationsModule } from './notifications/notifications.module';
import { CommandCenterModule } from './command-center/command-center.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ShieldModule } from './shield/shield.module';
import { IftaModule } from './ifta/ifta.module';
import { SupportModule } from './support/support.module';
import { HorizonModule } from './horizon/horizon.module';
import { LoadMonitoringJobHandler } from './safety-detect.processor';
import { AlertNotificationsJobHandler } from './alert-notifications.processor';
import { QueueModule } from '../../infrastructure/queue/queue.module';

@Module({
  imports: [
    AlertsModule,
    InAppNotificationsModule,
    CommandCenterModule,
    MonitoringModule,
    ShieldModule,
    IftaModule,
    SupportModule,
    HorizonModule,
    QueueModule,
  ],
  providers: [LoadMonitoringJobHandler, AlertNotificationsJobHandler],
  exports: [
    LoadMonitoringJobHandler,
    AlertNotificationsJobHandler,
    AlertsModule,
    InAppNotificationsModule,
    CommandCenterModule,
    MonitoringModule,
    ShieldModule,
    IftaModule,
    SupportModule,
    HorizonModule,
  ],
})
export class OperationsModule {}
