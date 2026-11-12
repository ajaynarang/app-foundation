-- IntegrationConfig.realm_id holds the vendor's account id. Atlassian cloud ids are 36-character UUIDs, so
-- VARCHAR(30) rejected the connect on save. Widening a varchar is metadata-only in Postgres: no rewrite, every row kept.
-- Down path (only while every stored value fits): ALTER TABLE "integration_configs" ALTER COLUMN "realm_id" TYPE VARCHAR(30);
ALTER TABLE "integration_configs" ALTER COLUMN "realm_id" TYPE VARCHAR(100);
