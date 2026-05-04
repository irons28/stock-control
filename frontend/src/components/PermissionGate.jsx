import { usePermission, getDeniedReason } from "../hooks/usePermission";

/**
 * PermissionGate — conditionally renders children based on role.
 *
 * Props:
 *   permission  — permission key from usePermission
 *   hide        — if true, renders nothing when denied (default: shows hint)
 *   hint        — custom denied message (overrides default)
 *   children    — content to show when allowed
 *   fallback    — element to show when denied instead of the default hint
 */
export default function PermissionGate({ permission, hide = false, hint, children, fallback }) {
  const allowed = usePermission(permission);

  if (allowed) return children;
  if (hide) return null;
  if (fallback !== undefined) return fallback;

  const message = hint || getDeniedReason(permission);
  return (
    <div className="permission-hint" role="note" aria-label="Permission required">
      <span className="permission-hint-icon" aria-hidden="true">⊘</span>
      <span>{message}</span>
    </div>
  );
}

/**
 * PermissionButton — renders a button that is disabled with a tooltip when not allowed.
 * Drop-in replacement for <Button> when an action needs gating without replacing the UI element.
 */
export function PermissionButton({ permission, hint, children, ...buttonProps }) {
  const allowed = usePermission(permission);
  const title = !allowed ? (hint || getDeniedReason(permission)) : buttonProps.title;

  return (
    <button
      {...buttonProps}
      disabled={!allowed || buttonProps.disabled}
      title={title}
      aria-disabled={!allowed}
      className={[buttonProps.className, !allowed ? "btn-permission-denied" : ""].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
