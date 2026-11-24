import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
type Size = 'default' | 'sm' | 'lg'

// Soft labels: the status colour as text on its own light tint, with a hairline
// border, so a page full of them stays readable and calm.
const VARIANTS: Record<Variant, string> = {
  default: 'border-primary/25 bg-primary/10 text-primary',
  secondary: 'border-border bg-secondary text-secondary-foreground',
  destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
  outline: 'border-border bg-card text-muted-foreground',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/25 bg-info/10 text-info',
}

const SIZES: Record<Size, string> = {
  default: 'px-2 py-0.5 text-xs',
  sm: 'px-1.5 py-px text-[11px] leading-4',
  lg: 'px-2.5 py-1 text-sm',
}

export interface BadgeProps extends ComponentProps<'span'> {
  variant?: Variant
  size?: Size
}

export function Badge({ className, variant = 'default', size = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-sm border font-medium',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
