/**
 * UI primitives from the scaffold, built on Base UI (@base-ui/react) and
 * styled with the app's theme tokens. Only the ones bumpcheck uses are kept.
 *
 * The look comes from the token values in `styles.css` (colours, `--radius`,
 * shadows): change those to change the app, without touching these files.
 *
 * @example
 * import { Button, Dialog, Select, useToast } from '../components/ui'
 */

/* Utility */
export { cn } from '@/lib/utils'

/* Form */
export { Button, buttonVariants, type ButtonProps } from './Button'
export { Input } from './Input'
export { Switch } from './Switch'

/* Data display */
export { Badge, type BadgeProps } from './Badge'
export { Avatar, AvatarImage, AvatarFallback } from './Avatar'

/* Feedback */
export { ToastProvider, useToast } from './Toast'

/* Overlay: `Modal` and `ConfirmModal` are built on the `Dialog` family (./Dialog). */
export { Modal, ConfirmModal } from './Modal'
export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuGroup,
  DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuRadioGroup,
} from './DropdownMenu'
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './Tooltip'
