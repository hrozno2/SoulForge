import { Component, type ErrorInfo, type ReactNode } from "react";
import { logEvent } from "../logbook";

declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

/**
 * Catches an error thrown while a screen is drawn (docs/AUDIT-2026-11-10.md, S7). Without it one broken screen
 * blanked the whole window, and the open character, loaded again at every start, kept it blank.
 *
 * `scope` says what failed, in the message and the log. The whole-app boundary offers to start without the open
 * character (it stays in the library); a screen's boundary offers to try again, and is reset by its `key`.
 */
export class ErrorBoundary extends Component<{ scope: string; whole?: boolean; children: ReactNode }, { error: Error | null; copied: boolean }> {
  state = { error: null as Error | null, copied: false };

  static getDerivedStateFromError(error: Error) {
    return { error, copied: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logEvent("crash", `${this.props.scope}: ${error?.message ?? error}${info.componentStack ? ` |${info.componentStack.split("\n").slice(0, 6).join(" |")}` : ""}`);
  }

  private details(): string {
    const e = this.state.error;
    return `Soul Forge ${APP_VERSION}, ${this.props.scope}\n${e?.message ?? e}\n${e?.stack ?? ""}`;
  }

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    const copy = async () => {
      try { await navigator.clipboard.writeText(this.details()); this.setState({ copied: true }); } catch { /* shown below to select by hand */ }
    };
    return (
      <div className="crash" role="alert">
        <h2>{this.props.whole ? "Soul Forge ran into a problem" : `${this.props.scope} could not be shown`}</h2>
        <p>This is a problem drawing the screen. Your saved characters are not changed by it.</p>
        <p className="crash-what">{String(error?.message ?? error)}</p>
        <div className="row">
          <button className="primary" onClick={() => this.setState({ error: null })}>Try again</button>
          {this.props.whole && (
            <button
              title="Opens Soul Forge with no character open. The character stays in your library on Home."
              onClick={() => { try { localStorage.removeItem(CURRENT_CHARACTER_KEY); } catch { /* storage can be unavailable */ } window.location.reload(); }}
            >
              Start without the open character
            </button>
          )}
          <button onClick={() => void copy()}>{copied ? "Copied" : "Copy the details"}</button>
        </div>
        <p className="muted">To report it: Menu, Report a bug, or paste the details in an issue.</p>
      </div>
    );
  }
}

/** Where the open character is kept between sessions (read in App.tsx). */
export const CURRENT_CHARACTER_KEY = "charforge.current.v2";
