import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'Acceptable Use Policy | SALLY',
};

export default function AcceptableUsePolicyPage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">Acceptable Use Policy</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        This Acceptable Use Policy (&quot;AUP&quot;) sets forth the rules and guidelines for using the SALLY platform.
        By using SALLY, you agree to comply with this policy in addition to our{' '}
        <Link href="/legal/terms" className="text-foreground underline underline-offset-2">
          Terms of Service
        </Link>
        .
      </p>

      {/* 1. Permitted Use */}
      <h2 id="permitted-use" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. Permitted Use
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY is designed for fleet management operations by authorized users of your organization. You may use the
        platform to manage drivers, vehicles, loads, billing, compliance, and other fleet operations activities in
        accordance with your subscription plan and applicable law.
      </p>

      {/* 2. Prohibited Conduct */}
      <h2 id="prohibited-conduct" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. Prohibited Conduct
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        You agree not to engage in any of the following activities:
      </p>
      <ol className="list-decimal ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Abuse AI features</span> — including prompt injection,
          jailbreaking, or using AI to generate harmful, misleading, or inappropriate content
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Attempt unauthorized access to other tenants&apos; data</span> —
          each organization&apos;s data is strictly isolated and any attempt to access another tenant&apos;s data is a
          violation
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Scrape, crawl, or automatically extract data</span> — from the
          platform without prior written authorization
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Reverse engineer, decompile, or disassemble</span> — the
          platform or any portion of it
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Circumvent security measures or rate limits</span> — designed to
          protect the platform and its users
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Share login credentials or API keys</span> — with unauthorized
          parties
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Use for any illegal purpose</span> — including violating any
          applicable local, state, national, or international law
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Upload malware or malicious files</span> — including viruses,
          trojans, worms, or any other harmful code
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Interfere with platform operation</span> — including actions
          that impose an unreasonable load on infrastructure
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Use to compete with SALLY</span> — by using the platform to
          develop or offer a competing product or service
        </li>
      </ol>

      {/* 3. AI Usage Rules */}
      <h2 id="ai-usage-rules" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. AI Usage Rules
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          Do not feed sensitive personally identifiable information (PII) beyond what is necessary for fleet operations
        </li>
        <li className="text-sm text-muted-foreground">
          Do not use AI outputs as the sole basis for safety-critical decisions — always have human verification
        </li>
        <li className="text-sm text-muted-foreground">
          AI recommendations are intended to supplement, not replace, professional judgment
        </li>
        <li className="text-sm text-muted-foreground">
          Report AI errors or unexpected behavior to{' '}
          <a href={mailto('sallySupport')} className="text-foreground underline underline-offset-2">
            {CONTACTS.sallySupport}
          </a>
        </li>
      </ul>

      {/* 4. Data Handling */}
      <h2 id="data-handling" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. Data Handling
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Only upload data that is relevant to your fleet operations</li>
        <li className="text-sm text-muted-foreground">
          Do not store data unrelated to your fleet management activities on the platform
        </li>
        <li className="text-sm text-muted-foreground">
          Respect driver privacy and handle personal data in compliance with applicable privacy laws
        </li>
        <li className="text-sm text-muted-foreground">
          Comply with all applicable data protection laws for any data you upload to or process through SALLY
        </li>
      </ul>

      {/* 5. Enforcement */}
      <h2 id="enforcement" className="text-lg font-semibold text-foreground mt-10 mb-4">
        5. Enforcement
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Violations of this Acceptable Use Policy may result in one or more of the following actions, depending on the
        severity and nature of the violation:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">A formal warning</li>
        <li className="text-sm text-muted-foreground">
          Temporary suspension of your account or access to specific features
        </li>
        <li className="text-sm text-muted-foreground">Permanent termination of your account</li>
        <li className="text-sm text-muted-foreground">
          Reporting to law enforcement authorities where required or appropriate
        </li>
      </ul>

      {/* 6. Reporting */}
      <h2 id="reporting" className="text-lg font-semibold text-foreground mt-10 mb-4">
        6. Reporting Violations
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you become aware of any violations of this policy, please report them to{' '}
        <a href={mailto('sallySupport')} className="text-foreground underline underline-offset-2">
          {CONTACTS.sallySupport}
        </a>
        . We take all reports seriously and will investigate promptly.
      </p>
    </div>
  );
}
