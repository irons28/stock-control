import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function useApiResource(endpoint) {
  const [state, setState] = useState({
    status: endpoint ? "loading" : "idle",
    data: null,
    error: "",
  });
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!endpoint) {
      setState({
        status: "idle",
        data: null,
        error: "",
      });
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      setState({
        status: "loading",
        data: null,
        error: "",
      });

      try {
        const data = await apiFetch(endpoint);

        if (cancelled) {
          return;
        }

        setState({
          status: "success",
          data,
          error: "",
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState({
          status: "error",
          data: null,
          error: error.message || "Unable to load data.",
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [endpoint, requestKey]);

  return {
    ...state,
    reload: () => setRequestKey((current) => current + 1),
  };
}
