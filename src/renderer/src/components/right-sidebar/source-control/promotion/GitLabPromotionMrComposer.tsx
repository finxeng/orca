import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { GitLabPromotionMrDetails } from '../../../../../../shared/gitlab-promotion-workflow'

export function GitLabPromotionMrComposer({
  source,
  target,
  issueNumbers,
  busy,
  onCancel,
  onCreate
}: {
  source: string
  target: string
  issueNumbers: number[]
  busy: boolean
  onCancel: () => void
  onCreate: (details: GitLabPromotionMrDetails) => void
}) {
  const draftId = useId()
  const [title, setTitle] = useState(`${source} → ${target}`)
  const [description, setDescription] = useState(
    [...new Set(issueNumbers)].map((number) => `Related to #${number}`).join('\n')
  )
  const [draft, setDraft] = useState(false)

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (title.trim() && !busy) {
          onCreate({ title: title.trim(), description, draft })
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="promotion-mr-title">
          {translate('gitlabPromotion.mrTitle', 'MR title')}
        </Label>
        <Input
          id="promotion-mr-title"
          value={title}
          maxLength={255}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="promotion-mr-description">
          {translate('gitlabPromotion.mrDescription', 'MR description')}
        </Label>
        <Textarea
          id="promotion-mr-description"
          value={description}
          maxLength={20_000}
          rows={6}
          disabled={busy}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={draftId}
          checked={draft}
          disabled={busy}
          onCheckedChange={(value) => setDraft(value === true)}
        />
        <Label htmlFor={draftId}>
          {translate('gitlabPromotion.createAsDraft', 'Create as draft')}
        </Label>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {translate('gitlabPromotion.cancel', 'Cancel')}
        </Button>
        <Button type="submit" disabled={busy || !title.trim()}>
          {translate('gitlabPromotion.confirmCreateMr', 'Create MR')}
        </Button>
      </div>
    </form>
  )
}
