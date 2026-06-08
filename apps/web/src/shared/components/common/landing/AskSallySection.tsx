'use client';

import { ScrollReveal } from './ScrollReveal';
import { Card } from '@sally/ui/components/ui/card';

// Reusable chat interface component
function ChatMockup({
  userType,
  examples,
}: {
  title: string;
  userType: string;
  examples: Array<{ userMessage: string; sallyResponse: React.ReactNode }>;
}) {
  return (
    <Card className="overflow-hidden shadow-xl h-full">
      {/* Chat Header */}
      <div className="bg-gradient-to-r from-black to-gray-800 dark:from-white dark:to-gray-200 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white dark:bg-black flex items-center justify-center font-bold text-black dark:text-white text-sm">
            S
          </div>
          <div>
            <div className="font-semibold text-white dark:text-black text-sm">SALLY</div>
            <div className="text-2xs text-gray-300 dark:text-gray-700">{userType}</div>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="bg-background p-4 space-y-4 h-[500px] overflow-y-auto">
        {/* Welcome message */}
        <div className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-black dark:bg-white flex-shrink-0 flex items-center justify-center font-bold text-white dark:text-black text-xs">
            S
          </div>
          <div className="flex-1">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-none px-3 py-2 inline-block max-w-[90%]">
              <p className="text-xs">
                Hi! I&apos;m SALLY.{' '}
                {userType === 'Dispatcher'
                  ? 'I can help you manage routes, check alerts, and coordinate your fleet.'
                  : 'I can help you with your route, breaks, and schedule.'}
              </p>
            </div>
          </div>
        </div>

        {/* Conversation examples */}
        {examples.map((example, index) => (
          <div key={index} className="space-y-2">
            {/* User message */}
            <div className="flex gap-2 justify-end">
              <div className="flex-1 flex justify-end">
                <div className="bg-black dark:bg-white text-white dark:text-black rounded-2xl rounded-tr-none px-3 py-2 inline-block max-w-[85%]">
                  <p className="text-xs">{example.userMessage}</p>
                </div>
              </div>
              <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0 flex items-center justify-center text-xs">
                👤
              </div>
            </div>

            {/* SALLY response */}
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-black dark:bg-white flex-shrink-0 flex items-center justify-center font-bold text-white dark:text-black text-xs">
                S
              </div>
              <div className="flex-1">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-none px-3 py-2 inline-block max-w-[90%]">
                  {example.sallyResponse}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input area (visual only) */}
      <div className="bg-background border-t border-border px-4 py-3">
        <div className="flex gap-2 items-center">
          <div className="flex-1 bg-muted rounded-full px-3 py-2 text-muted-foreground text-xs">
            Type your question...
          </div>
          <div className="w-8 h-8 rounded-full bg-black dark:bg-white flex items-center justify-center text-white dark:text-black font-bold text-sm">
            →
          </div>
        </div>
      </div>
    </Card>
  );
}

export function AskSallySection() {
  // Dispatcher chat examples
  const dispatcherExamples = [
    {
      userMessage: 'Is Route #1247 on track?',
      sallyResponse: (
        <div className="space-y-1.5">
          <p className="text-xs">
            Route #1247 is <span className="font-semibold text-muted-foreground">on track</span>:
          </p>
          <div className="bg-background/50 dark:bg-background/30 rounded p-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Progress:</span>
              <span className="font-medium">Stop 3 of 7</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ETA:</span>
              <span className="font-medium">3:45 PM (on time)</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      userMessage: 'Why was Route #1832 re-planned?',
      sallyResponse: (
        <div className="space-y-1.5">
          <p className="text-xs">Route #1832 was re-planned due to:</p>
          <div className="bg-caution/10 rounded p-2 text-xs border border-caution/20">
            <div className="font-semibold text-caution">⚠️ Dock delay</div>
            <div className="text-2xs text-muted-foreground mt-1">
              3hr actual vs 1hr planned
              <br />
              Rest stop added for compliance
            </div>
          </div>
        </div>
      ),
    },
  ];

  // Driver chat examples
  const driverExamples = [
    {
      userMessage: 'Where should I take my 10-hour break?',
      sallyResponse: (
        <div className="space-y-1.5">
          <p className="text-xs">I recommend:</p>
          <div className="bg-background/50 dark:bg-background/30 rounded p-2 text-xs">
            <div className="font-semibold">Love&apos;s - Exit 47</div>
            <div className="text-2xs text-muted-foreground mt-1">
              • 2.3 hours from now
              <br />
              • Stays compliant
              <br />• On schedule after rest
            </div>
          </div>
        </div>
      ),
    },
    {
      userMessage: 'Can I make my next appointment?',
      sallyResponse: (
        <div className="space-y-1.5">
          <p className="text-xs">Yes! Here&apos;s the breakdown:</p>
          <div className="bg-background/50 dark:bg-background/30 rounded p-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Drive time:</span>
              <span className="font-medium">3.5 hrs</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Until appt:</span>
              <span className="font-medium">4.7 hrs</span>
            </div>
          </div>
          <p className="text-2xs text-muted-foreground">✓ 1.2 hour buffer</p>
        </div>
      ),
    },
  ];

  return (
    <section className="py-32 bg-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-center mb-12">Ask SALLY Anything</h2>
          <p className="text-center text-muted-foreground mb-12">
            SALLY understands context and provides instant answers
          </p>
        </ScrollReveal>

        {/* Two Chat Interfaces Side by Side */}
        <div className="grid md:grid-cols-2 gap-6 max-w-6xl mx-auto">
          <ScrollReveal delay={0.2}>
            <div>
              <h3 className="text-lg font-semibold text-center mb-4">Dispatcher</h3>
              <ChatMockup title="Dispatcher Chat" userType="Dispatcher" examples={dispatcherExamples} />
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <div>
              <h3 className="text-lg font-semibold text-center mb-4">Driver</h3>
              <ChatMockup title="Driver Chat" userType="Driver" examples={driverExamples} />
            </div>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={0.4}>
          <p className="text-center text-muted-foreground mt-8 text-sm">
            Context-aware conversations tailored for each role
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
