import * as fs from 'fs';
import * as path from 'path';

/**
 * `IntegrationConfig.realmId` holds the vendor's account id (a QuickBooks realm, a Xero org, an Atlassian cloud id).
 * Atlassian cloud ids are 36-character UUIDs, so VarChar(30) rejected the connect on save. The column is VarChar(100)
 * (migration 20261112190000_widen_integration_realm_id).
 */
describe('IntegrationConfig.realmId width', () => {
  const schema = fs.readFileSync(
    path.resolve(__dirname, '../../../../../../packages/appshore/db/prisma/schema/foundation.prisma'),
    'utf8',
  );

  it('holds a 36-character vendor account id, with room to spare', () => {
    const match = schema.match(/^\s*realmId\s+String\?\s+@map\("realm_id"\)\s+@db\.VarChar\((\d+)\)/m);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBeGreaterThanOrEqual(100);
  });
});
