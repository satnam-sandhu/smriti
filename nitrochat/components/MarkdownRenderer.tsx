'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** Tighter tables/spacing for embedded or narrow layouts */
  compact?: boolean;
}

export function MarkdownRenderer({ content, className = '', compact = false }: MarkdownRendererProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div
      className={`prose prose-invert max-w-none ${compact ? 'prose-sm [&_p]:my-2 [&_li]:my-0.5 [&_ul]:my-2 [&_ol]:my-2' : 'prose-sm'} ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');

            return !inline && match ? (
              <div className="relative group my-4">
                <button
                  onClick={() => handleCopyCode(codeString)}
                  className="absolute top-2 right-2 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors opacity-0 group-hover:opacity-100 z-10"
                  title="Copy code"
                >
                  {copiedCode === codeString ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-white" />
                  )}
                </button>
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: '0.5rem',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                  {...props}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            ) : (
              <code className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono text-sm" {...props}>
                {children}
              </code>
            );
          },
          pre({ children }: any) {
            return <>{children}</>;
          },
          p({ children }: any) {
            return <p className="mb-4 leading-7">{children}</p>;
          },
          ul({ children }: any) {
            return <ul className="list-disc list-inside mb-4 space-y-2">{children}</ul>;
          },
          ol({ children }: any) {
            return <ol className="list-decimal list-inside mb-4 space-y-2">{children}</ol>;
          },
          li({ children }: any) {
            return <li className="ml-4">{children}</li>;
          },
          h1({ children }: any) {
            return <h1 className="text-2xl font-medium mt-6 mb-4">{children}</h1>;
          },
          h2({ children }: any) {
            return <h2 className="text-xl font-medium mt-5 mb-3">{children}</h2>;
          },
          h3({ children }: any) {
            return <h3 className="text-lg font-normal mt-4 mb-2">{children}</h3>;
          },
          blockquote({ children }: any) {
            return (
              <blockquote className="border-l-4 border-primary/50 pl-4 italic my-4 text-muted">
                {children}
              </blockquote>
            );
          },
          a({ href, children }: any) {
            return (
              <a
                href={href}
                className="text-accent hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          table({ children }: any) {
            return (
              <div className={compact ? 'my-2 overflow-x-auto' : 'my-4 overflow-x-auto'}>
                <table
                  className={
                    compact
                      ? 'min-w-full rounded-lg border border-border/60 text-sm'
                      : 'min-w-full rounded-lg border border-white/10'
                  }
                >
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }: any) {
            return (
              <thead className={compact ? 'bg-muted/20' : 'bg-white/5'}>{children}</thead>
            );
          },
          th({ children }: any) {
            return (
              <th
                className={
                  compact
                    ? 'border-b border-border/60 px-2 py-1.5 text-left text-xs font-medium md:px-2.5 md:text-sm'
                    : 'border-b border-white/10 px-4 py-2 text-left font-normal'
                }
              >
                {children}
              </th>
            );
          },
          td({ children }: any) {
            return (
              <td
                className={
                  compact
                    ? 'border-b border-border/40 px-2 py-1.5 align-top text-xs md:px-2.5 md:text-sm'
                    : 'border-b border-white/10 px-4 py-2'
                }
              >
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
