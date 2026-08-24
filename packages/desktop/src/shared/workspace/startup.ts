import type { EmergencyRecovery, EmergencyScan, StartupIntent, WorkspaceSeed } from './types'

/**
 * V1 startup has no normal workspace restore branch.  Emergency sources are
 * scanned first and independently, even when explicit files were supplied.
 */
export class DefaultStartupPolicy {
  seed(intent: StartupIntent): WorkspaceSeed {
    if (intent.kind === 'explicit-targets') {
      return { kind: 'explicit-targets', targets: [...intent.targets] }
    }
    return { kind: 'clean-new-tab', targets: [] }
  }

  async start(intent: StartupIntent, emergency: EmergencyRecovery): Promise<{
    readonly emergency: EmergencyScan
    readonly seed: WorkspaceSeed
  }> {
    const emergencyScan: EmergencyScan = {
      crashDrafts: await emergency.crashDrafts.scan(),
      moves: await emergency.moves.scan()
    }
    return { emergency: emergencyScan, seed: this.seed(intent) }
  }
}
