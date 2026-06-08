import type { Metadata } from 'next';
import { LegalSidebar } from './components/LegalSidebar';
import { MobileLegalNav } from './components/MobileLegalNav';
import { TableOfContents } from './components/TableOfContents';

export const metadata: Metadata = {
  title: 'Legal',
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12">
      {/* Mobile Navigation */}
      <div className="md:hidden mb-6">
        <MobileLegalNav />
      </div>

      <div className="flex gap-8">
        {/* Left sidebar — navigation */}
        <aside className="hidden md:block w-52 flex-shrink-0">
          <div className="sticky top-24">
            <LegalSidebar />
          </div>
        </aside>

        {/* Center — page content */}
        <div className="flex-1 min-w-0 max-w-3xl" data-legal-content>
          {children}
        </div>

        {/* Right sidebar — table of contents */}
        <aside className="hidden lg:block w-44 flex-shrink-0">
          <div className="sticky top-24">
            <TableOfContents />
          </div>
        </aside>
      </div>
    </div>
  );
}
