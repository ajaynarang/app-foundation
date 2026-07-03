'use client';

import { createContext } from 'react';
import { SseBus } from './sse-bus';

export const SseBusContext = createContext<SseBus | null>(null);
