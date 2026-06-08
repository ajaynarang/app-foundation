// ---------------------------------------------------------------------------
// Desk engine contracts (local to the desk domain).
//
// These types used to live in `@app/shared-types/desk`. They were moved here to
// keep shared-types domain-free. Prisma-mirrored enums are still imported from
// `@app/shared-types`; all desk-specific shapes are defined locally. Author your
// responsibility/agent/condition vocabulary in these files.
// ---------------------------------------------------------------------------
export * from './enums';
export * from './workflow';
export * from './step';
export * from './approval';
export * from './episode';
export * from './responsibility';
export * from './schedule';
export * from './agent-detail';
export * from './memory';
export * from './suppression';
