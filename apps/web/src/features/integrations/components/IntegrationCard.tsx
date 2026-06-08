'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import {
  type IntegrationConfig,
  type IntegrationType,
  getIntegrationTypeLabel,
  formatRelativeTime,
  getVendorRegistry,
  type VendorMetadata,
} from '@/features/integrations';
import { AlertCircle, CheckCircle2, Circle, Link as LinkIcon } from 'lucide-react';

interface IntegrationCardProps {
  integration: IntegrationConfig;
  onConfigure: (integration: IntegrationConfig) => void;
  onRefresh: () => void;
}

export function IntegrationCard({ integration, onConfigure, onRefresh: _onRefresh }: IntegrationCardProps) {
  const [vendors, setVendors] = useState<VendorMetadata[]>([]);

  // Fetch vendor registry
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const vendorList = await getVendorRegistry();
        setVendors(vendorList);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch vendor registry:', error);
      }
    };
    fetchVendors();
  }, []);

  // Get vendor metadata
  const vendorMeta = vendors.find((v) => v.id === integration.vendor);

  const statusConfig = {
    ACTIVE: {
      icon: <CheckCircle2 className="h-4 w-4 text-muted-foreground" />,
      text: 'Connected',
      color: 'text-muted-foreground',
    },
    ERROR: {
      icon: <AlertCircle className="h-4 w-4 text-critical" />,
      text: 'Error',
      color: 'text-critical',
    },
    CONFIGURED: {
      icon: <Circle className="h-4 w-4 text-caution" />,
      text: 'Configured',
      color: 'text-caution',
    },
    NOT_CONFIGURED: {
      icon: <Circle className="h-4 w-4 text-muted-foreground" />,
      text: 'Not Connected',
      color: 'text-muted-foreground',
    },
    DISABLED: {
      icon: <Circle className="h-4 w-4 text-muted-foreground" />,
      text: 'Disabled',
      color: 'text-muted-foreground',
    },
    NEEDS_RECONNECT: {
      icon: <Circle className="h-4 w-4 text-caution" />,
      text: 'Reconnect Required',
      color: 'text-caution',
    },
  };

  const currentStatus = statusConfig[integration.status];

  return (
    <Card className="transition-all hover:shadow-md border-border">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <IntegrationIcon type={integration.integrationType} />
              <div>
                <h3 className="font-semibold text-lg text-foreground">
                  {getIntegrationTypeLabel(integration.integrationType)}
                </h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {currentStatus.icon}
                  <span className={currentStatus.color}>{currentStatus.text}</span>
                  {integration.status === 'ACTIVE' && (
                    <>
                      <span>•</span>
                      <span>{vendorMeta?.displayName || integration.vendor}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {integration.status === 'ACTIVE' && integration.lastSyncAt && (
              <div className="mt-3 text-sm text-muted-foreground">
                Last synced {formatRelativeTime(integration.lastSyncAt)}
              </div>
            )}

            {integration.status === 'ERROR' && integration.lastErrorMessage && (
              <div className="mt-3 p-3 rounded-md bg-critical/10 border border-critical/20">
                <p className="text-sm text-critical">{integration.lastErrorMessage}</p>
              </div>
            )}

            {integration.status === 'NOT_CONFIGURED' && (
              <div className="mt-3 text-sm text-muted-foreground">
                {getConfigureHelpText(integration.integrationType)}
              </div>
            )}
          </div>

          <div className="flex gap-2 ml-4">
            {integration.status === 'NOT_CONFIGURED' ? (
              <Button variant="default" size="sm" onClick={() => onConfigure(integration)}>
                <LinkIcon className="h-4 w-4 mr-2" />
                Connect
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => onConfigure(integration)}>
                Configure
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationIcon({ type }: { type: IntegrationType }) {
  const icons: Record<string, string> = {
    TMS: '🚛',
    ELD: '📋',
    ACCOUNTING: '💰',
  };

  return (
    <div className="text-2xl" role="img" aria-label={type}>
      {icons[type]}
    </div>
  );
}

function getConfigureHelpText(type: IntegrationType): string {
  const helpText: Record<string, string> = {
    TMS: 'Connect your TMS to sync loads and assignments automatically',
    ELD: 'Connect your ELD to sync driver hours of service data',
    ACCOUNTING: 'Connect your accounting system for settlements and invoicing',
  };
  return helpText[type];
}
