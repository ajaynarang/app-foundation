/**
 * Legal pages layout — shared prose container.
 *
 * The pages under /legal are PLACEHOLDERS shipped with the starter template so
 * that the footer, registration consent, sidebar, and cookie-banner links
 * resolve. Replace their content with your own attorney-reviewed policies
 * before launch.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 md:px-6 py-10 md:py-14">
      <div className="mb-8 rounded-md border border-caution/30 bg-caution/10 px-4 py-3 text-sm text-foreground">
        <strong>Template placeholder.</strong> This page ships with the starter so links resolve. Replace it with your
        own attorney-reviewed policy before launch.
      </div>
      <article className="space-y-6 text-sm leading-relaxed text-muted-foreground [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-foreground [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:pt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
        {children}
      </article>
    </div>
  );
}
