'use client';

import { useState, useEffect } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import {
  type IntegrationConfig,
  type IntegrationType,
  type IntegrationVendor,
  createIntegration,
  updateIntegration,
  testConnection,
  getVendorRegistry,
  type VendorMetadata,
} from '@/features/integrations';
import {
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  UploadCloud,
} from 'lucide-react';
import { getOAuthConnectUrl } from '@/features/integrations';

interface ConfigureIntegrationFormProps {
  integration: IntegrationConfig | null;
  integrationType?: IntegrationType;
  vendor?: IntegrationVendor;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  displayName: string;
  credentials: Record<string, string>;
}

export function ConfigureIntegrationForm({
  integration,
  integrationType,
  vendor,
  onSuccess,
  onCancel,
}: ConfigureIntegrationFormProps) {
  const isNewIntegration = !integration;

  const [formData, setFormData] = useState<FormData>({
    displayName: integration?.displayName || '',
    credentials: {},
  });

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorMetadata[]>([]);
  const [, setIsLoadingVendors] = useState(true);

  // Fetch vendor registry on mount
  useEffect(() => {
    const fetchVendors = async () => {
      try {
        setIsLoadingVendors(true);
        const vendorList = await getVendorRegistry();
        setVendors(vendorList);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch vendor registry:', error);
      } finally {
        setIsLoadingVendors(false);
      }
    };

    fetchVendors();
  }, []);

  // Get current vendor and compute metadata
  const currentVendor = integration?.vendor || vendor;
  const currentIntegrationType = integration?.integrationType || integrationType;

  // Get selected vendor metadata
  const selectedVendorMeta = vendors.find((v) => v.id === currentVendor);

  // Derive connection capabilities from connectionMethods
  const methods = selectedVendorMeta?.connectionMethods ?? [];
  const oauthMethod = methods.find((m) => m.type === 'oauth');
  const credentialsMethod = methods.find((m) => m.type === 'credentials');
  const fileUploadMethod = methods.find((m) => m.type === 'file_upload');

  const hasOAuth = !!oauthMethod;
  const hasCredentials = !!credentialsMethod;
  const hasFileUpload = !!fileUploadMethod;
  const isOAuthVendor = hasOAuth;
  const credentialFields = credentialsMethod?.type === 'credentials' ? credentialsMethod.fields : [];
  const [showApiTokenForm, setShowApiTokenForm] = useState(false);

  // Update display name when vendor metadata becomes available
  useEffect(() => {
    if (selectedVendorMeta && !integration && !formData.displayName) {
      setFormData((prev) => ({
        ...prev,
        displayName: selectedVendorMeta.displayName,
      }));
    }
  }, [selectedVendorMeta, integration, formData.displayName]);

  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setTestResult(null);
  };

  const handleTest = async () => {
    // Validate required credentials
    if (selectedVendorMeta) {
      const missingFields = credentialFields.filter((f) => f.required && !formData.credentials[f.name]);
      if (missingFields.length > 0) {
        setTestResult({
          success: false,
          message: `Please enter: ${missingFields.map((f) => f.label).join(', ')}`,
        });
        return;
      }
    }

    setIsTesting(true);
    setTestResult(null);
    setError(null);

    try {
      if (isNewIntegration) {
        // For new integrations, we need to create first
        if (!integrationType || !vendor) {
          throw new Error('Integration type and vendor required');
        }

        const newIntegration = await createIntegration({
          integrationType: integrationType,
          vendor,
          displayName: formData.displayName,
          credentials: formData.credentials,
        });

        // Test the newly created integration
        const result = await testConnection(newIntegration.id);
        setTestResult(result);

        if (result.success) {
          // Auto-save and close on success
          setTimeout(() => {
            onSuccess();
          }, 1500);
        }
      } else if (integration) {
        // Update existing with new credentials
        await updateIntegration(integration.id, {
          displayName: formData.displayName,
          credentials: formData.credentials,
        });

        const result = await testConnection(integration.id);
        setTestResult(result);
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (isOAuthVendor && isNewIntegration && !showApiTokenForm) return; // OAuth flow — save not applicable unless using API token
    if (!formData.displayName) {
      setError('Display name is required');
      return;
    }

    // Validate required credentials
    if (selectedVendorMeta) {
      const missingFields = credentialFields.filter((f) => f.required && !formData.credentials[f.name]);
      if (missingFields.length > 0) {
        setError(`Missing required fields: ${missingFields.map((f) => f.label).join(', ')}`);
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      if (isNewIntegration) {
        if (!integrationType || !vendor) {
          throw new Error('Integration type and vendor are required');
        }

        await createIntegration({
          integrationType: integrationType,
          vendor,
          displayName: formData.displayName,
          credentials: formData.credentials,
        });
      } else if (integration) {
        await updateIntegration(integration.id, {
          displayName: formData.displayName,
          credentials: formData.credentials,
        });
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save integration');
    } finally {
      setIsSaving(false);
    }
  };

  // OAuth path: render Authorize button instead of (or alongside) credential form
  if (isOAuthVendor && !integration) {
    const vendorName = selectedVendorMeta?.displayName || currentVendor || 'Unknown Vendor';
    const handleAuthorize = async () => {
      setIsRedirecting(true);
      try {
        const { authUrl } = await getOAuthConnectUrl(currentVendor!);
        window.location.href = authUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get authorization URL');
        setIsRedirecting(false);
      }
    };

    return (
      <div className="space-y-6">
        {/* Integration Info */}
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{getIntegrationIcon(currentIntegrationType)}</div>
            <div>
              <h3 className="font-semibold text-foreground">{vendorName}</h3>
              <p className="text-sm text-muted-foreground">
                {selectedVendorMeta?.description || getIntegrationTypeDescription(currentIntegrationType)}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {vendorName} uses OAuth to connect securely. You&apos;ll be redirected to authorize access, then returned
            here to complete setup.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-critical/10 border border-critical/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-critical mt-0.5" />
              <p className="text-sm text-critical">{error}</p>
            </div>
          </div>
        )}

        {/* Dual option: OAuth + API token for vendors that support both */}
        {hasOAuth && hasCredentials && (
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-auto px-0"
              onClick={() => setShowApiTokenForm(!showApiTokenForm)}
            >
              {showApiTokenForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Advanced: Use API Token instead
            </Button>
            {showApiTokenForm && (
              <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => handleInputChange('displayName', e.target.value)}
                    placeholder={`e.g., Production ${vendorName}`}
                  />
                </div>
                {credentialFields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type={field.type === 'password' ? 'password' : field.type}
                      placeholder={field.placeholder}
                      required={field.required}
                      value={formData.credentials[field.name] || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          credentials: { ...prev.credentials, [field.name]: e.target.value },
                        }))
                      }
                    />
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                  </div>
                ))}
                <Button onClick={handleSave} loading={isSaving} className="w-full">
                  Save with API Token
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={onCancel} disabled={isRedirecting}>
            Cancel
          </Button>
          <div className="flex-1" />
          <Button onClick={handleAuthorize} loading={isRedirecting}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Connect with {vendorName}
          </Button>
        </div>
      </div>
    );
  }

  // File-upload-only vendors (no OAuth, no credential fields)
  const isFileUploadOnly = !isOAuthVendor && !hasCredentials && hasFileUpload;

  // Reconnect banner for OAuth integrations with expired/revoked tokens
  if (isOAuthVendor && integration?.status === 'NEEDS_RECONNECT') {
    const vendorName = selectedVendorMeta?.displayName || currentVendor || 'Unknown Vendor';
    const handleReconnect = async () => {
      setIsRedirecting(true);
      try {
        const { authUrl } = await getOAuthConnectUrl(currentVendor!);
        window.location.href = authUrl;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get authorization URL');
        setIsRedirecting(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="p-4 rounded-lg bg-critical/10 border border-critical/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-critical shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-critical">{vendorName} authorization expired</p>
              <p className="text-sm text-critical/80 mt-1">
                The {vendorName} refresh token has expired or been revoked. You need to reconnect to resume syncing.
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={isRedirecting}>
            Cancel
          </Button>
          <div className="flex-1" />
          <Button onClick={handleReconnect} loading={isRedirecting}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Reconnect {vendorName}
          </Button>
        </div>
      </div>
    );
  }

  // File-upload-only path: show info + file upload zone (both new and existing)
  if (isFileUploadOnly) {
    const vendorName = selectedVendorMeta?.displayName || currentVendor || 'Unknown Vendor';
    const formats =
      fileUploadMethod?.type === 'file_upload'
        ? fileUploadMethod.acceptedFormats.map((f) => f.toUpperCase()).join(', ')
        : 'CSV, XLSX';

    return (
      <div className="space-y-6">
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{getIntegrationIcon(currentIntegrationType)}</div>
            <div>
              <h3 className="font-semibold text-foreground">{vendorName}</h3>
              <p className="text-sm text-muted-foreground">
                {selectedVendorMeta?.description || getIntegrationTypeDescription(currentIntegrationType)}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            type="text"
            value={formData.displayName}
            onChange={(e) => handleInputChange('displayName', e.target.value)}
            placeholder={`e.g., ${vendorName} Transactions`}
          />
        </div>

        <div className="p-6 rounded-lg border-2 border-dashed border-border bg-muted/30 text-center space-y-2">
          <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">File Upload Integration</p>
          <p className="text-xs text-muted-foreground">
            {vendorName} uses file uploads to import data. Accepted formats: {formats}.
          </p>
          {isNewIntegration ? (
            <p className="text-xs text-muted-foreground">
              Save this integration first, then upload files from the integration detail page.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Use the <strong>Upload</strong> button on the integration card to import files.
            </p>
          )}
        </div>

        {error && (
          <div className="p-4 rounded-lg bg-critical/10 border border-critical/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-critical mt-0.5" />
              <p className="text-sm text-critical">{error}</p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <div className="flex-1" />
          <Button onClick={handleSave} loading={isSaving}>
            {isNewIntegration ? 'Save Integration' : 'Update'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Integration Info */}
      <div className="p-4 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{getIntegrationIcon(currentIntegrationType)}</div>
          <div>
            <h3 className="font-semibold text-foreground">
              {selectedVendorMeta?.displayName || currentVendor || 'Unknown Vendor'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedVendorMeta?.description || getIntegrationTypeDescription(currentIntegrationType)}
            </p>
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            type="text"
            value={formData.displayName}
            onChange={(e) => handleInputChange('displayName', e.target.value)}
            placeholder="e.g., Production Samsara"
          />
          <p className="text-xs text-muted-foreground">A friendly name to identify this connection</p>
        </div>

        {/* Dynamic Credential Fields */}
        {credentialFields.length > 0 && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Credentials</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Enter your {selectedVendorMeta?.displayName} credentials
              </p>
            </div>

            {credentialFields.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label htmlFor={field.name}>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                <div className="relative">
                  <Input
                    id={field.name}
                    name={field.name}
                    type={field.type === 'password' ? (showPasswords[field.name] ? 'text' : 'password') : field.type}
                    placeholder={field.placeholder}
                    required={field.required}
                    value={formData.credentials[field.name] || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        credentials: {
                          ...prev.credentials,
                          [field.name]: e.target.value,
                        },
                      }))
                    }
                    className={field.type === 'password' ? 'pr-10' : ''}
                  />
                  {field.type === 'password' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setShowPasswords((prev) => ({
                          ...prev,
                          [field.name]: !prev[field.name],
                        }))
                      }
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                    >
                      {showPasswords[field.name] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test Result */}
      {testResult && (
        <div
          className={`p-4 rounded-lg border ${
            testResult.success ? 'bg-muted border-border' : 'bg-critical/10 border-critical/20'
          }`}
        >
          <div className="flex items-start gap-2">
            {testResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-critical mt-0.5" />
            )}
            <p className={`text-sm ${testResult.success ? 'text-muted-foreground' : 'text-critical'}`}>
              {testResult.message}
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 rounded-lg bg-critical/10 border border-critical/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-critical mt-0.5" />
            <p className="text-sm text-critical">{error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-4 border-t border-border">
        <Button variant="outline" onClick={onCancel} disabled={isSaving || isTesting}>
          Cancel
        </Button>

        <div className="flex-1" />

        <Button
          variant="outline"
          onClick={handleTest}
          disabled={isSaving || Object.keys(formData.credentials).length === 0}
          loading={isTesting}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Test Connection
        </Button>

        <Button onClick={handleSave} disabled={isTesting} loading={isSaving}>
          Save Configuration
        </Button>
      </div>
    </div>
  );
}

function getIntegrationIcon(type?: IntegrationType): string {
  const icons: Record<string, string> = {
    TMS: '🚛',
    ELD: '📋',
    ACCOUNTING: '💰',
  };
  return type ? icons[type] : '🔌';
}

function getIntegrationTypeDescription(type?: IntegrationType): string {
  const descriptions: Record<string, string> = {
    TMS: 'Transportation Management System',
    ELD: 'ELD (HOS & Telematics)',
    ACCOUNTING: 'Accounting',
  };
  return type ? descriptions[type] : 'Integration';
}
