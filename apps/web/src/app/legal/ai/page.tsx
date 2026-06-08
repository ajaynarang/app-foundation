import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'AI Transparency | SALLY',
};

export default function AITransparencyPage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">AI Transparency</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        At SALLY, we believe transparency about how we use artificial intelligence is essential to building trust. This
        page explains how AI is integrated into our platform, what data it processes, and how you stay in control.
      </p>

      {/* 1. How Sally Uses AI */}
      <h2 id="how-sally-uses-ai" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. How SALLY Uses AI
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        AI is woven into SALLY to help you operate your fleet more efficiently. Here is how:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Sally AI chat assistant</span> — ask natural language questions
          about your fleet, loads, drivers, and operations. Use voice input or text. Sally connects to 20+ integrated
          tools to pull real-time answers from your data
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Document intelligence</span> — upload a rate confirmation and
          SALLY automatically extracts origin, destination, rates, equipment requirements, and special instructions. No
          manual data entry needed
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Shield compliance engine</span> — automated fleet audits that
          score your compliance posture across HOS regulations, vehicle maintenance, load documentation, and more. Get
          actionable findings, not just alerts
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Route optimization</span> — HOS-aware route planning that
          accounts for driving time limits, mandatory rest stops, fuel stop recommendations, and real-time conditions
        </li>
      </ul>

      {/* 2. Data Processed by AI */}
      <h2 id="data-processed-by-ai" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. Data Processed by AI
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        When you use AI-powered features, SALLY may process the following types of data:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Load details — origin, destination, weight, equipment type</li>
        <li className="text-sm text-muted-foreground">Driver information — name, HOS status, current location</li>
        <li className="text-sm text-muted-foreground">Vehicle data — type, status, telematics readings</li>
        <li className="text-sm text-muted-foreground">Uploaded documents — rate confirmations, bills of lading</li>
        <li className="text-sm text-muted-foreground">Your conversation history with Sally AI</li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        All data is processed solely to provide the service you requested. We do not use your data for any other
        purpose.
      </p>

      {/* 3. Model Providers */}
      <h2 id="model-providers" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. Model Providers
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        SALLY uses OpenAI models via the AI SDK for natural language processing and understanding. Our agreement with
        OpenAI{' '}
        <span className="font-medium text-foreground">
          explicitly prohibits the use of customer data for model training
        </span>
        . Data sent to AI models is covered by our Data Processing Agreement.
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        We continuously evaluate AI providers and may add or change providers to improve the service. Any changes will
        be reflected on this page and in our{' '}
        <Link href="/legal/dpa" className="text-foreground underline underline-offset-2">
          DPA
        </Link>{' '}
        sub-processor list.
      </p>

      {/* 4. AI Decision-Making */}
      <h2 id="ai-decision-making" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. AI Decision-Making
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        AI provides recommendations, not automated decisions. All critical actions in SALLY require human confirmation:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Load assignments</span> — a dispatcher reviews and approves
          every assignment
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Billing and invoicing</span> — authorized personnel must approve
          before invoices are sent
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Compliance determinations</span> — Shield findings are reviewed
          by fleet managers before any action is taken
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Route changes</span> — drivers and dispatchers confirm all route
          modifications
        </li>
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        AI outputs are suggestions — your team makes the final call.
      </p>

      {/* 5. Human Oversight */}
      <h2 id="human-oversight" className="text-lg font-semibold text-foreground mt-10 mb-4">
        5. Human Oversight
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">Every AI recommendation can be overridden by your team</li>
        <li className="text-sm text-muted-foreground">
          Shield compliance findings must be reviewed by authorized personnel before any action is taken
        </li>
        <li className="text-sm text-muted-foreground">
          AI cannot autonomously modify load assignments, generate invoices, or change driver records
        </li>
        <li className="text-sm text-muted-foreground">
          You maintain full control over all operational decisions at every step
        </li>
      </ul>

      {/* 6. Accuracy Disclaimers */}
      <h2 id="accuracy-disclaimers" className="text-lg font-semibold text-foreground mt-10 mb-4">
        6. Accuracy and Limitations
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        AI is a powerful tool, but it is not infallible. Please keep the following in mind:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">AI can make mistakes — always verify important outputs</li>
        <li className="text-sm text-muted-foreground">
          Route suggestions should be verified against current road conditions, closures, and restrictions
        </li>
        <li className="text-sm text-muted-foreground">
          Compliance analysis supplements but does not replace professional compliance review
        </li>
        <li className="text-sm text-muted-foreground">SALLY is not a legal, compliance, or safety advisor</li>
        <li className="text-sm text-muted-foreground">
          Always apply professional judgment to AI-generated recommendations
        </li>
      </ul>

      {/* 7. Data Retention for AI */}
      <h2 id="data-retention-ai" className="text-lg font-semibold text-foreground mt-10 mb-4">
        7. AI Data Retention
      </h2>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">AI conversation logs</span> — retained for 90 days for service
          improvement, then automatically deleted
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Document processing</span> — data is retained only during active
          processing and is not stored after extraction is complete
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Model training</span> — no customer data is used for model
          training, ever
        </li>
      </ul>

      {/* 8. Opt-Out */}
      <h2 id="opt-out" className="text-lg font-semibold text-foreground mt-10 mb-4">
        8. Opting Out of AI Features
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        You can opt out of optional AI features by contacting{' '}
        <a href={mailto('sallySupport')} className="text-foreground underline underline-offset-2">
          {CONTACTS.sallySupport}
        </a>
        . Core platform functionality — including fleet management, billing, and compliance tracking — does not require
        AI and will continue to work normally.
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-4">
        Some features are inherently AI-powered and cannot function without AI processing. These include document
        intelligence (automated rate-con parsing) and Sally AI chat. Opting out will disable these specific features for
        your account.
      </p>

      {/* 9. Contact */}
      <h2 id="contact" className="text-lg font-semibold text-foreground mt-10 mb-4">
        9. Contact
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        For AI-related inquiries, please contact us at{' '}
        <a href={mailto('sallySupport')} className="text-foreground underline underline-offset-2">
          {CONTACTS.sallySupport}
        </a>
        .
      </p>
    </div>
  );
}
