import type {
  EmergencyRecovery,
  EmergencyScan,
  NonEmptyReadonlyArray,
  StartupIntent,
  WorkspaceSeed
} from './types'

// prettier-ignore
export class EmergencyRecoveryScanError extends Error {
  readonly crashDrafts?: unknown
  readonly moves?: unknown

  constructor(crashDrafts?: unknown, moves?: unknown) {
    super('one or more emergency recovery scans failed')
    this.name = 'EmergencyRecoveryScanError'
    this.crashDrafts = crashDrafts
    this.moves = moves
  }
}

/**
 * V1 startup has no normal workspace restore branch.  Emergency sources are
 * scanned first and independently, even when explicit files were supplied.
 */
// prettier-ignore
export class DefaultStartupPolicy {
  seed(intent: StartupIntent): WorkspaceSeed {
    if (intent.kind === 'explicit-targets') {
      if (intent.targets.length > 0) {
        return {
          kind: 'explicit-targets',
          targets: [...intent.targets] as NonEmptyReadonlyArray<(typeof intent.targets)[number]>
        }
      }
    }
    return { kind: 'clean-new-tab', targets: [] }
  }

  async start(
    intent: StartupIntent,
    emergency: EmergencyRecovery
  ): Promise<{
      readonly emergency: EmergencyScan
      readonly seed: WorkspaceSeed
    }> {
    const [crashDrafts, moves] = await Promise.allSettled([
      Promise.resolve().then(() => emergency.crashDrafts.scan()),
      Promise.resolve().then(() => emergency.moves.scan())
    ])
    if (crashDrafts.status === 'rejected' || moves.status === 'rejected') {
      throw new EmergencyRecoveryScanError(
        crashDrafts.status === 'rejected' ? crashDrafts.reason : undefined,
        moves.status === 'rejected' ? moves.reason : undefined
      )
    }
    const emergencyScan: EmergencyScan = {
      crashDrafts: crashDrafts.value,
      moves: moves.value
    }
    return { emergency: emergencyScan, seed: this.seed(intent) }
  }
}
