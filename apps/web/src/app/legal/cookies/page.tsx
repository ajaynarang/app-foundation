import type { Metadata } from 'next';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { CONTACTS, mailto } from '@/shared/lib/contacts';
import { AttorneyReviewBanner } from '../components/AttorneyReviewBanner';
import { LEGAL_LAST_UPDATED } from '../constants';

export const metadata: Metadata = {
  title: 'Cookie Policy | SALLY',
};

export default function CookiePolicyPage() {
  return (
    <div className="space-y-6">
      <AttorneyReviewBanner />

      <p className="text-xs text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">Cookie Policy</h1>

      <p className="text-sm text-muted-foreground leading-relaxed">
        This Cookie Policy explains how SALLY (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) uses cookies and
        similar tracking technologies when you use our platform.
      </p>

      {/* 1. What Are Cookies */}
      <h2 id="what-are-cookies" className="text-lg font-semibold text-foreground mt-10 mb-4">
        1. What Are Cookies
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Cookies are small text files that are stored on your device (computer, tablet, or mobile) when you visit a
        website. They are widely used to make websites work efficiently, provide information to site owners, and improve
        the user experience. Similar technologies include web beacons, pixels, and local storage.
      </p>

      {/* 2. Cookies We Use */}
      <h2 id="cookies-we-use" className="text-lg font-semibold text-foreground mt-10 mb-4">
        2. Cookies We Use
      </h2>

      <div className="overflow-x-auto">
        <Table className="w-full text-sm border border-border rounded-lg">
          <TableHeader>
            <TableRow className="border-b border-border bg-muted/50">
              <TableHead className="text-left px-4 py-3 font-medium text-foreground">Name</TableHead>
              <TableHead className="text-left px-4 py-3 font-medium text-foreground">Type</TableHead>
              <TableHead className="text-left px-4 py-3 font-medium text-foreground">Purpose</TableHead>
              <TableHead className="text-left px-4 py-3 font-medium text-foreground">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="border-b border-border">
              <TableCell className="px-4 py-3 text-muted-foreground font-mono text-xs">sally-cookies</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">Essential</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">Stores your cookie consent preferences</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">1 year</TableCell>
            </TableRow>
            <TableRow className="border-b border-border">
              <TableCell className="px-4 py-3 text-muted-foreground font-mono text-xs">Firebase Auth token</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">Essential</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">Maintains your authentication session</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">Session</TableCell>
            </TableRow>
            <TableRow className="border-b border-border">
              <TableCell className="px-4 py-3 text-muted-foreground font-mono text-xs">__csrf</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">Essential</TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                Protects against cross-site request forgery attacks
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">Session</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="px-4 py-3 text-muted-foreground italic" colSpan={2}>
                Analytics cookies
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                Usage patterns, feature adoption metrics, page views — only collected when you opt in via our cookie
                banner
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">Varies</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* 3. Third-Party Cookies */}
      <h2 id="third-party-cookies" className="text-lg font-semibold text-foreground mt-10 mb-4">
        3. Third-Party Cookies
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Some cookies are set by third-party services that appear on our pages:
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Firebase / Google</span> — used for authentication
          infrastructure. Subject to{' '}
          <a
            href="https://policies.google.com/privacy"
            className="text-foreground underline underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google&apos;s Privacy Policy
          </a>
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Analytics provider</span> — only active if you have consented to
          analytics cookies. Subject to the provider&apos;s own privacy policy
        </li>
      </ul>

      {/* 4. Managing Cookies */}
      <h2 id="managing-cookies" className="text-lg font-semibold text-foreground mt-10 mb-4">
        4. Managing Cookies
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">You have several options for managing cookies:</p>
      <ul className="list-disc ml-6 space-y-2">
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Browser settings</span> — most browsers allow you to refuse or
          delete cookies through their settings. Note that disabling essential cookies may prevent SALLY from
          functioning properly
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Cookie preferences tool</span> — you can update your cookie
          preferences at any time by clicking &quot;Cookie Preferences&quot; in the footer of any page
        </li>
        <li className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Effect of disabling analytics</span> — opting out of analytics
          cookies has no impact on platform functionality. All core features work without analytics cookies
        </li>
      </ul>

      {/* 5. Changes */}
      <h2 id="changes" className="text-lg font-semibold text-foreground mt-10 mb-4">
        5. Changes to This Policy
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We may update this Cookie Policy from time to time to reflect changes in the cookies we use or for operational,
        legal, or regulatory reasons. We encourage you to review this page periodically for the latest information on
        our cookie practices.
      </p>

      {/* 6. Contact */}
      <h2 id="contact" className="text-lg font-semibold text-foreground mt-10 mb-4">
        6. Contact
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you have questions about our use of cookies, please contact us at{' '}
        <a href={mailto('legal')} className="text-foreground underline underline-offset-2">
          {CONTACTS.legal}
        </a>
        .
      </p>
    </div>
  );
}
