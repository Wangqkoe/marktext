import fs from 'node:fs/promises'
import path from 'node:path'
import { CrashDraftStore } from '../../packages/desktop/src/main/crashDraftRecovery'

const main = async(): Promise<void> => {
  const profile = process.argv[2]
  if (!profile) throw new Error('usage: prepare-manual-recovery-profile.ts <new-profile>')

  await fs.mkdir(profile)
  const store = new CrashDraftStore(path.join(profile, 'crash-drafts'))
  const result = await store.checkpoint({
    documentId: 'unresolved-recovery-document',
    documentRevision: 1,
    markdown: '# Unresolved recovery draft\n',
    view: {
      cursor: {
        anchor: { offset: 0 },
        focus: { offset: 0 },
        anchorPath: [0, 'text'],
        focusPath: [0, 'text']
      },
      selection: null
    }
  })
  if (!result.durable) throw new Error(`checkpoint failed: ${result.reason}`)

  const records = await store.scan()
  if (
    records.length !== 1 ||
    records[0]?.draft.documentId !== 'unresolved-recovery-document' ||
    records[0]?.draft.documentRevision !== 1
  ) {
    throw new Error(`unexpected scan: ${JSON.stringify(records)}`)
  }

  console.log(JSON.stringify({ profile: path.resolve(profile), result, records }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
