import { onBeforeUnmount, onUnmounted } from 'vue'
import type { WorkspaceController } from '@shared/workspace'

/**
 * Parent assembly cleanup starts before descendants are removed, while the
 * controller remains live until every pane has finalized and released its
 * current editor lease.
 */
export const registerWorkspaceTreeUnmount = (
  controller: Pick<WorkspaceController, 'dispose'>,
  cleanup: () => void
): void => {
  onBeforeUnmount(cleanup)
  onUnmounted(() => controller.dispose())
}
