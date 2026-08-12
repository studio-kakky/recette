import type { ComponentProps } from 'react';

import { cn } from '~/lib/utils';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // モバイルでフォーカス時に拡大されないよう、本文サイズは 16px を保つ
        'border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 field-sizing-content flex min-h-16 w-full rounded-lg border px-3 py-2 text-base transition-all outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3 sm:text-sm',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
