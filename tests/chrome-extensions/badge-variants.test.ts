import { expect, it } from 'vitest'
import { badgeVariants } from '../../packages/chrome-extensions/panel/app/components/ui/badge/variants'

it('provides the base style and the chosen foundation badge variant', () => {
  expect(badgeVariants({ variant: 'outline' })).toContain('border-border text-muted-foreground')
  expect(badgeVariants({ variant: 'secondary' })).toContain('bg-secondary text-secondary-foreground')
  expect(badgeVariants({ variant: 'default' })).toContain('bg-primary text-primary-foreground')
  expect(badgeVariants({ variant: 'destructive' })).toContain('bg-destructive text-destructive-foreground')
})
