/**
 * Loads an ESM-only package from this CommonJS build.
 *
 * With `"module": "commonjs"`, TypeScript rewrites `await import('pkg')` into `require('pkg')`,
 * which cannot load an ES module (`Cannot use 'import.meta' outside a module`). Building the call
 * through `new Function` hides it from the compiler, so Node performs a real dynamic `import()`.
 *
 * Use `typeof import('pkg')` as the type argument to keep the package's types.
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate: the only way to emit a native import() from a CJS build
const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

export function importEsm<TModule>(specifier: string): Promise<TModule> {
  return nativeImport(specifier) as Promise<TModule>;
}
