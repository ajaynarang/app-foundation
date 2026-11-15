import * as Sentry from '@sentry/nextjs';
import { buildSentryOptions } from '@appshore/web-core/shared/lib/sentry-options';

/** The browser. A no-op without NEXT_PUBLIC_SENTRY_DSN: the SDK is never initialised and nothing is sent. */
const options = buildSentryOptions();
if (options) Sentry.init(options);
