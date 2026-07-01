import { useApp } from '../context/SupabaseAppContext';

export function useWorkspaceId(): string {
  const { state } = useApp();
  const workspaceId =
    state.currentUser?.workspace_id ||
    state.settings?.workspaceId ||
    state.settings?.id ||
    '';

  if (!workspaceId) {
    console.error('⚠️ workspaceId is missing from state!');
  }

  return workspaceId;
}
