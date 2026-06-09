'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@app/ui/components/ui/accordion';
import { Button } from '@app/ui/components/ui/button';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { useAssistantCapabilities } from '../../hooks/use-assistant-capabilities';
import { useAssistantStore } from '../../store';

export function CapabilitiesCard({ data: _data }: { data: Record<string, unknown> }) {
  const { data, isLoading } = useAssistantCapabilities();

  const handleExampleClick = (example: string) => {
    useAssistantStore.getState().sendMessage(example, 'text');
  };

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-2 space-y-2">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-5/6" />
        <Skeleton className="h-7 w-4/6" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-2 space-y-1">
      <Accordion type="single" collapsible className="space-y-1">
        {data.categories.map((cat) => (
          <AccordionItem key={cat.title} value={`cat-${cat.title}`} className="border-none">
            <AccordionTrigger className="py-1.5 px-2 text-xs font-medium text-foreground hover:no-underline rounded-md hover:bg-muted">
              {cat.title}
            </AccordionTrigger>
            <AccordionContent className="pb-1 px-2">
              <div className="space-y-1">
                {cat.items.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    onClick={() => handleExampleClick(item.example)}
                    className="w-full h-auto text-left p-1.5 justify-start"
                  >
                    <div>
                      <p className="text-xs font-medium text-foreground">{item.name}</p>
                      <p className="text-2xs text-muted-foreground">{item.description}</p>
                      <p className="text-2xs text-info mt-0.5">&quot;{item.example}&quot;</p>
                    </div>
                  </Button>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
