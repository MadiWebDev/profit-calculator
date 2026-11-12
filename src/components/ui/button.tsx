'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { resolveButtonLoadingState } from '@/lib/button-loading';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-all duration-300',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        gradient: 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:shadow-xl hover:scale-105',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-8 text-base',
        xl: 'h-12 rounded-lg px-10 text-lg font-semibold',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * While true the button shows an inline spinner, is disabled (so a
   * double-click cannot re-submit), and reports `aria-busy`. Focus is
   * preserved: the button stays in the DOM, it only becomes disabled.
   * A loading button never auto-submits or retries on its own — retries
   * are always user-initiated.
   */
  loading?: boolean;
  /**
   * Label shown while `loading`. When omitted the original label is kept
   * and the spinner is prepended. Ignored when `asChild` is true.
   */
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    // The loading spinner can only be injected into a plain <button>;
    // with `asChild` the child owns the markup, so loading only disables
    // the button and sets aria-busy there.
    const state = resolveButtonLoadingState({
      loading,
      loadingText,
      disabled,
      // The label itself is rendered from `children` below; the helper
      // only decides disabled / aria-busy / spinner visibility here.
      label: '',
    });

    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          disabled={state.disabled}
          aria-busy={state.ariaBusy || undefined}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={state.disabled}
        aria-busy={state.ariaBusy || undefined}
        {...props}
      >
        {state.showSpinner && (
          <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        )}
        {loading && loadingText ? loadingText : children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
