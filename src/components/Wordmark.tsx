/**
 * bumpcheck's mark: an upward arrow (a version bump) in the accent colour,
 * and the name in monospace. The same arrow is the favicon
 * (public/favicon.svg). Plain markup with no hooks, so the static landing
 * page can use it too.
 */

import { APP_NAME } from '../constants'
import { cn } from '../lib/utils'

export function Wordmark({ className, size = 'sm' }: { className?: string; size?: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'h-9 w-9 sm:h-10 sm:w-10' : 'h-5 w-5'
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono font-semibold tracking-tight text-foreground', className)}>
      <svg viewBox="0 0 32 32" aria-hidden className={cn('shrink-0', box)}>
        <rect width="32" height="32" rx="6" fill="var(--color-primary)" />
        <path d="M16 7 L24 16 H19 V25 H13 V16 H8 Z" fill="var(--color-primary-foreground)" />
      </svg>
      <span>{APP_NAME}</span>
    </span>
  )
}
