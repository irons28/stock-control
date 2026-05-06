import { useState } from "react";
import { useUser } from "../context/UserContext";

function LoginPage({ onSuccess }) {
  const { login, authStatus } = useUser();
  const [formState, setFormState] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(formState.username, formState.password);
      onSuccess?.();
    } catch (submitError) {
      setError(submitError.message || "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-copy">
          <div className="login-brand-hero">
            <img
              className="app-brand-logo app-brand-logo--login"
              src="/swan-logo.png"
              alt="SwanRetail logo"
            />
            <div className="app-brand-wordmark app-brand-wordmark--login">
              <p className="eyebrow">Stock Control</p>
              <h1 className="app-brand-title app-brand-title--login">
                <span>Swan</span>
                <span>Retail</span>
              </h1>
              <p className="app-brand-subtitle">Operations Workspace</p>
            </div>
          </div>
          <h2>Sign in to continue</h2>
          <p>
            Use your username and password to open the stock workspace with the right permissions
            for your role.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input
              type="text"
              value={formState.username}
              onChange={(event) =>
                setFormState((current) => ({ ...current, username: event.target.value }))
              }
              autoComplete="username"
              placeholder="Enter your username"
              required
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={formState.password}
              onChange={(event) =>
                setFormState((current) => ({ ...current, password: event.target.value }))
              }
              autoComplete="current-password"
              placeholder="Enter your password"
              required
            />
          </label>

          {error ? <div className="login-error">{error}</div> : null}

          <button
            type="submit"
            className="btn login-submit"
            disabled={submitting || authStatus === "loading"}
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
