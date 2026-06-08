import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="text-3xl font-bold tracking-tight text-foreground mt-8 mb-4 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-2xl font-semibold tracking-tight text-foreground mt-8 mb-3 border-b border-border pb-2">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xl font-semibold text-foreground mt-6 mb-2">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-lg font-medium text-foreground mt-4 mb-2">
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className="text-muted-foreground leading-7 mb-4">{children}</p>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors"
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside space-y-1 mb-4 text-muted-foreground">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside space-y-1 mb-4 text-muted-foreground">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-7">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-border pl-4 italic text-muted-foreground my-4">
        {children}
      </blockquote>
    ),
    code: ({ children, ...props }) => {
      // Inline code (no className means not a code block)
      if (!props.className) {
        return (
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono text-foreground">
            {children}
          </code>
        );
      }
      // Code block (rendered by pre wrapper)
      return <code {...props}>{children}</code>;
    },
    pre: ({ children }) => (
      <pre className="rounded-lg border border-border bg-muted p-4 overflow-x-auto mb-4 text-sm">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-4">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="border-b border-border">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="text-left font-semibold text-foreground p-3">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border-b border-border p-3 text-muted-foreground">
        {children}
      </td>
    ),
    hr: () => <hr className="border-border my-8" />,
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    ...components,
  };
}
