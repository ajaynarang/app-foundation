'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Rocket, Clock, Sparkles } from 'lucide-react';

export interface ComingSoonBannerProps {
  title: string;
  description: string;
  features?: string[];
  category?: string;
}

/**
 * Full-page coming soon banner for disabled features
 * Shows marketing content explaining what's coming
 */
export function ComingSoonBanner({ title, description, features, category }: ComingSoonBannerProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 rounded-full blur-xl opacity-50 animate-pulse" />
              <div className="relative bg-background border-2 border-border rounded-full p-6">
                <Rocket className="h-16 w-16 text-foreground" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Badge variant="outline" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                Coming Soon
              </Badge>
              {category && (
                <Badge variant="muted" className="text-xs capitalize">
                  {category}
                </Badge>
              )}
            </div>

            <CardTitle className="text-3xl font-bold">{title}</CardTitle>
            <CardDescription className="text-base">{description}</CardDescription>
          </div>
        </CardHeader>

        {features && features.length > 0 && (
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              <span>What to Expect</span>
            </div>

            <ul className="space-y-3">
              {features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="mt-0.5 h-5 w-5 rounded-full bg-gray-100 dark:bg-gray-900 border border-border flex items-center justify-center flex-shrink-0">
                    <div className="h-2 w-2 rounded-full bg-foreground" />
                  </div>
                  <span className="text-sm text-muted-foreground flex-1">{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default ComingSoonBanner;
