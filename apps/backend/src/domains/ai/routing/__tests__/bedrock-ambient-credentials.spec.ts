import { AiCredentialType } from '@appshore/db';
import {
  fromNodeProviderChain as fromNodeProviderChainImport,
  fromTemporaryCredentials as fromTemporaryCredentialsImport,
} from '@aws-sdk/credential-providers';
import { createAmazonBedrock as createAmazonBedrockImport } from '@ai-sdk/amazon-bedrock';
import { BEDROCK_ROLE_SESSION_SECONDS, PLATFORM_ROUTES, TENANT_CREDENTIAL_CAPABILITIES } from '../route-registry';

jest.mock('@aws-sdk/credential-providers', () => ({
  fromNodeProviderChain: jest.fn(() => jest.fn()),
  fromTemporaryCredentials: jest.fn(() => jest.fn()),
}));
jest.mock('@ai-sdk/amazon-bedrock', () => ({
  ...jest.requireActual('@ai-sdk/amazon-bedrock'),
  createAmazonBedrock: jest.fn(jest.requireActual('@ai-sdk/amazon-bedrock').createAmazonBedrock),
}));

const fromNodeProviderChain = fromNodeProviderChainImport as jest.Mock;
const fromTemporaryCredentials = fromTemporaryCredentialsImport as jest.Mock;
const createAmazonBedrock = createAmazonBedrockImport as jest.Mock;

/**
 * The role a workspace trusts is the role that calls. A workspace's trust policy names `PLATFORM_ASSUME_ROLE_ARN`, the
 * backend task role, so `AssumeRole` must be signed by the task's own (ambient) credentials: no intermediate role, no
 * `masterCredentials`. If the registry chained through any other principal, every connect and every call would be
 * denied by the workspace's trust policy.
 */
describe('Bedrock routes sign with the ambient credentials', () => {
  beforeEach(() => jest.clearAllMocks());

  it('BEDROCK_ROLE assumes the workspace role with no masterCredentials, its external id, a named one-hour session', () => {
    TENANT_CREDENTIAL_CAPABILITIES.BEDROCK_ROLE.buildProvider(
      {
        type: AiCredentialType.BEDROCK_ROLE,
        publicId: 'aicred_role00001',
        roleArn: 'arn:aws:iam::123456789012:role/acme-bedrock-access',
        externalId: 'acme-ws_test01',
        awsRegion: 'eu-west-1',
      },
      null,
      { projectSlug: 'acme' },
    );

    expect(fromTemporaryCredentials).toHaveBeenCalledTimes(1);
    const options = fromTemporaryCredentials.mock.calls[0][0];
    expect(options).not.toHaveProperty('masterCredentials');
    expect(options.params).toEqual({
      RoleArn: 'arn:aws:iam::123456789012:role/acme-bedrock-access',
      ExternalId: 'acme-ws_test01',
      RoleSessionName: 'acme-aicred_role00001',
      DurationSeconds: BEDROCK_ROLE_SESSION_SECONDS,
    });
    expect(options.clientConfig).toEqual({ region: 'eu-west-1' });
    // The provider signs with exactly that temporary-credential chain, in the workspace's region.
    expect(createAmazonBedrock).toHaveBeenCalledWith({
      region: 'eu-west-1',
      credentialProvider: fromTemporaryCredentials.mock.results[0].value,
    });
  });

  it('platform-bedrock signs with the default AWS chain (the task role), never a role it assumes', () => {
    const route = PLATFORM_ROUTES.find((r) => r.routeId === 'platform-bedrock');
    route?.buildProvider({ platformBedrockRegion: 'us-east-1' });

    expect(fromTemporaryCredentials).not.toHaveBeenCalled();
    expect(fromNodeProviderChain).toHaveBeenCalledTimes(1);
    expect(fromNodeProviderChain.mock.calls[0]).toEqual([]);
    expect(createAmazonBedrock).toHaveBeenCalledWith({
      region: 'us-east-1',
      credentialProvider: fromNodeProviderChain.mock.results[0].value,
    });
  });
});
