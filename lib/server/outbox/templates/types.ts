// Props for the react-email templates wired to outbox events. Each interface
// mirrors what the corresponding action passes when it builds the email body.
// Keep this file dependency-free so it can be imported from templates,
// actions, and tests without pulling React.

export interface WorkspaceApprovedProps {
  workspaceName: string;
  orgLabel: string;
  loginUrl: string;
}

export interface WorkspaceRejectedProps {
  workspaceName: string;
  orgLabel: string;
  reason: string;
  reapplyUrl: string;
}
