import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { DocsSidebar } from '../../components/docs-sidebar';
import { DocsHeaderLinks } from '../../components/docs-header-link';
import { DocsOnlyHeaderLinks } from '../../components/docs-only-header-links';

const isDocsOnly = process.env.NEXT_PUBLIC_DOCS_ONLY_MODE === 'true';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isAuthenticated = !!cookieStore.get('sally-auth')?.value;

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border bg-background sticky top-0 z-30">
        <div className="h-full flex items-center justify-between px-6">
          <Link href="/docs" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Image
              src="/sally-logo-dark.svg"
              alt="SALLY"
              width={28}
              height={28}
              className="h-7 w-7 dark:block hidden"
            />
            <Image
              src="/sally-logo-light.svg"
              alt="SALLY"
              width={28}
              height={28}
              className="h-7 w-7 dark:hidden block"
            />
            <span className="text-xl font-bold tracking-tight font-space-grotesk text-foreground">
              {isDocsOnly ? 'SALLY Docs' : 'SALLY Console'}
            </span>
          </Link>
          {isDocsOnly ? <DocsOnlyHeaderLinks /> : <DocsHeaderLinks isAuthenticated={isAuthenticated} />}
        </div>
      </header>
      <div className="flex">
        <DocsSidebar />
        <main className="flex-1 min-w-0 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
