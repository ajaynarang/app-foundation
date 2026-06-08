import type { Metadata } from 'next';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'Security Overview | SALLY',
};

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">Security Overview</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        At SALLY, security is foundational to everything we build. We protect your fleet data with enterprise-grade
        infrastructure, strong encryption, and rigorous operational practices. This page outlines how we keep your data
        safe.
      </p>

      {/* 1. Infrastructure */}
      <h2 id="infrastructure" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. Infrastructure
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">AWS cloud infrastructure in US regions</li>
        <li className="text-sm text-muted-foreground">ECS containers for application workloads</li>
        <li className="text-sm text-muted-foreground">PostgreSQL 16 with pgvector for data storage</li>
        <li className="text-sm text-muted-foreground">Redis 7 for caching and queuing</li>
        <li className="text-sm text-muted-foreground">Isolated tenant environments with logical data separation</li>
        <li className="text-sm text-muted-foreground">Infrastructure managed via Terraform (infrastructure as code)</li>
      </ul>

      {/* 2. Encryption */}
      <h2 id="encryption" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. Encryption
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Data at rest</span> — AES-256 encryption using AWS-managed
          encryption keys
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Data in transit</span> — TLS 1.3 for all client-server
          communication
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Database</span> — encrypted at the storage layer
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Backups</span> — encrypted with the same standards as primary
          data
        </li>
      </ul>

      {/* 3. Authentication */}
      <h2 id="authentication" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. Authentication
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Firebase Authentication as identity provider</li>
        <li className="text-sm text-muted-foreground">Password-based authentication with strength requirements</li>
        <li className="text-sm text-muted-foreground">OTP (one-time password) verification via SMS</li>
        <li className="text-sm text-muted-foreground">Session management with secure token handling</li>
        <li className="text-sm text-muted-foreground">Multi-factor authentication available for enterprise plans</li>
      </ul>

      {/* 4. Access Control */}
      <h2 id="access-control" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. Access Control
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Role-based access control (RBAC)</span> — 5 roles: Super Admin,
          Admin, Dispatcher, Driver, Customer
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Multi-tenant isolation</span> — every database query scoped to
          tenant_id
        </li>
        <li className="text-sm text-muted-foreground">API key management for programmatic access</li>
        <li className="text-sm text-muted-foreground">Principle of least privilege for internal access</li>
      </ul>

      {/* 5. Monitoring */}
      <h2 id="monitoring" className="text-lg font-semibold text-foreground mt-10 mb-4">
        5. Monitoring
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Distributed tracing via Jaeger</li>
        <li className="text-sm text-muted-foreground">Application-level logging and audit trails</li>
        <li className="text-sm text-muted-foreground">
          Rate limiting: 100 requests per minute (global), stricter limits on authentication endpoints
        </li>
        <li className="text-sm text-muted-foreground">Real-time alerting for anomalous behavior</li>
        <li className="text-sm text-muted-foreground">BullMQ job monitoring for background tasks</li>
      </ul>

      {/* 6. Incident Response */}
      <h2 id="incident-response" className="text-lg font-semibold text-foreground mt-10 mb-4">
        6. Incident Response
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We follow a four-phase incident response approach:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Detection</span> — automated monitoring and alerting
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Containment</span> — isolate affected systems
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Eradication</span> — remove root cause
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Recovery</span> — restore normal operation
        </li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        Post-incident review is conducted within 5 business days. Customers are notified within 72 hours for data
        breaches.
      </p>

      {/* 7. Compliance */}
      <h2 id="compliance" className="text-lg font-semibold text-foreground mt-10 mb-4">
        7. Compliance
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">SOC 2 Type II</span> — in progress (target completion noted)
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">CCPA compliant</span> — privacy rights fully supported
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">FMCSA</span> — fleet data handling aligned with federal motor
          carrier requirements
        </li>
        <li className="text-sm text-muted-foreground">Regular third-party security assessments</li>
      </ul>

      {/* 8. Responsible Disclosure */}
      <h2 id="responsible-disclosure" className="text-lg font-semibold text-foreground mt-10 mb-4">
        8. Responsible Disclosure
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you discover a security vulnerability, please report it to{' '}
        <a href={mailto('security')} className="text-foreground underline underline-offset-2">
          {CONTACTS.security}
        </a>
        . We commit to:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Acknowledging receipt within 2 business days</li>
        <li className="text-sm text-muted-foreground">No legal action against good-faith security researchers</li>
        <li className="text-sm text-muted-foreground">90-day coordinated disclosure timeline</li>
        <li className="text-sm text-muted-foreground">Public credit (if desired) after the fix is deployed</li>
      </ul>

      {/* 9. Contact */}
      <h2 id="contact" className="text-lg font-semibold text-foreground mt-10 mb-4">
        9. Contact
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        For security questions or to report a vulnerability, please contact us at{' '}
        <a href={mailto('security')} className="text-foreground underline underline-offset-2">
          {CONTACTS.security}
        </a>
        .
      </p>
    </div>
  );
}
