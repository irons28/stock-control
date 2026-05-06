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
          <div className="login-brand-lockup">
            <div className="app-brand-mark app-brand-mark--login" aria-hidden="true">
              <svg viewBox="0 0 64 64" role="presentation" focusable="false">
                <defs>
                  <linearGradient id="loginBrandCubeStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#11C5E8" />
                    <stop offset="100%" stopColor="#8EEBFF" />
                  </linearGradient>
                </defs>
                <path
                  d="M32 7 51 18v28L32 57 13 46V18Z"
                  fill="none"
                  stroke="url(#loginBrandCubeStroke)"
                  strokeWidth="4"
                  strokeLinejoin="round"
                />
                <path d="M32 7v50M13 18l19 11 19-11" fill="none" stroke="#F7FAFC" strokeWidth="3" strokeOpacity="0.9" />
                <circle cx="49" cy="15" r="6" fill="#11C5E8" />
              </svg>
            </div>
            <div>
              <p className="eyebrow">Stock Control</p>
              <h1>Operations Workspace</h1>
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
