import { canSelfUpdate, type UpdateState } from "../updater";
import { RELEASES_URL } from "../config";
import { openExternal } from "../store";

interface Props {
  found: UpdateState | null;
  status: string;
  busy: boolean;
  install: () => void;
  dismiss?: () => void;
}

const PACKAGE_HINT: Record<string, string> = {
  "package-arch": "Update with pacman: sudo pacman -Syu.",
  package: "Download and install the newer package from the releases page.",
};

export function UpdateBanner({ found, status, busy, install, dismiss }: Props) {
  if (!found && !status) return null;
  return (
    <div className="update-banner noprint">
      {found ? (
        <>
          <span>
            Version {found.version} is available.{" "}
            {!canSelfUpdate(found.kind) && (PACKAGE_HINT[found.kind] ?? "")}
          </span>
          {canSelfUpdate(found.kind) ? (
            <button className="primary" disabled={busy} onClick={install}>
              {busy ? "Updating..." : "Install and restart"}
            </button>
          ) : (
            <button onClick={() => openExternal(RELEASES_URL)}>Open releases page</button>
          )}
        </>
      ) : null}
      {status && <span className="muted">{status}</span>}
      {status && !busy && dismiss && <button aria-label="Dismiss" title="Dismiss" onClick={dismiss}>×</button>}
    </div>
  );
}
