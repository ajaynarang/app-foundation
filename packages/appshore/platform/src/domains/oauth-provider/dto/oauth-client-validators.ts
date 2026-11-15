import { registerDecorator, type ValidationOptions } from 'class-validator';

function parseUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** An absolute URL of any scheme: what `z.string().url()` accepts (a native app may redirect to its own scheme). */
export function IsAbsoluteUrl(options?: ValidationOptions): PropertyDecorator {
  return (target, property) =>
    registerDecorator({
      name: 'isAbsoluteUrl',
      target: target.constructor,
      propertyName: String(property),
      options: { message: 'Each redirect URI must be an absolute URL', ...options },
      validator: { validate: (value: unknown) => parseUrl(value) !== null },
    });
}

/** True for `https://…`, or `http://localhost` / `http://127.0.0.1` on any port. */
export function isHttpsOrLoopbackUrl(value: unknown): boolean {
  const url = parseUrl(value);
  if (!url) return false;
  return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

/**
 * A redirect URI a self-registering client may use: HTTPS, or a loopback address (the MCP authorization spec).
 */
export function IsHttpsOrLoopbackUrl(options?: ValidationOptions): PropertyDecorator {
  return (target, property) =>
    registerDecorator({
      name: 'isHttpsOrLoopbackUrl',
      target: target.constructor,
      propertyName: String(property),
      options: { message: 'redirect_uris must use HTTPS or be localhost URLs', ...options },
      validator: { validate: isHttpsOrLoopbackUrl },
    });
}
