/**
 * HTTP client for the EduConnect API.
 *
 * Handles token storage, attaches the Bearer header, and transparently
 * refreshes an expired access token — so callers never have to think
 * about the 15-minute token lifetime.
 */

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

/**
 * The access token lives in a module variable, never in localStorage.
 *
 * localStorage is readable by any script on the page, so a single XSS bug
 * hands an attacker a working session. In memory it dies with the tab, and
 * the long-lived refresh token is in an httpOnly cookie the page cannot read
 * at all — so there is nothing durable for injected script to steal.
 *
 * The cost is that a page reload starts with no access token; `restoreSession`
 * silently trades the cookie for a new one on boot.
 */
let accessToken = null;

export const tokens = {
  get access() {
    return accessToken;
  },
  set({ accessToken: next }) {
    if (next) accessToken = next;
  },
  clear() {
    accessToken = null;
  },
};

/**
 * Thrown for any non-2xx response. Carries the API's message and field errors.
 *
 * `status` is 0 when the request never reached a server at all — offline, DNS
 * failure, connection refused. `isNetwork` lets a caller tell "the server said
 * no" apart from "there was no server", which need different wording.
 */
export class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.isNetwork = status === 0;
  }
}

/**
 * Shown whenever the API can't be reached. Worth being specific: in local
 * development the usual cause is simply that the backend isn't running, and
 * "Server returned 500" sent people hunting for a server bug instead.
 */
const UNREACHABLE =
  "Can't reach the EduConnect API. Check that the backend is running on port 5001 and that you're online.";

/** Called when refreshing fails — the app uses this to bounce to the login screen. */
let onSessionExpired = () => {};
export const setSessionExpiredHandler = (fn) => {
  onSessionExpired = fn;
};

// While a refresh is in flight, other 401s wait on this promise instead of
// each firing their own refresh (which would revoke one another's tokens).
let refreshPromise = null;

/** Trades the httpOnly refresh cookie for a new access token. */
async function refreshTokens() {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // sends the refresh cookie
    body: "{}",
  });

  if (!res.ok) {
    tokens.clear();
    onSessionExpired();
    throw new ApiError(401, "Session expired — please sign in again");
  }

  const body = await res.json();
  tokens.set(body.data);
  return body.data.accessToken;
}

/**
 * Called once on boot. Returns the signed-in user if the refresh cookie is
 * still valid, or null — a reload shouldn't force anyone to log in again.
 */
export async function restoreSession() {
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: "{}",
    });
    if (!res.ok) return null;

    const body = await res.json();
    tokens.set(body.data);
    return body.data.user;
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body, params, retry = true } = {}) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";

  const access = tokens.access;
  if (access) headers.Authorization = `Bearer ${access}`;

  let res;
  try {
    res = await fetch(url.pathname + url.search, {
      method,
      headers,
      // The refresh cookie is path-scoped to /api/auth, so this only actually
      // sends anything on the auth routes.
      credentials: "include",
      ...(body && { body: JSON.stringify(body) }),
    });
  } catch {
    // fetch only rejects when the request never got a response — offline,
    // connection refused, DNS. Unwrapped, this reached callers as a bare
    // TypeError with no `status`, so error handling keyed on status missed it.
    throw new ApiError(0, UNREACHABLE);
  }

  if (res.status === 204) return null;

  let payload;
  try {
    payload = await res.json();
  } catch {
    // The API always sends a JSON envelope, including on its own 500s. A
    // non-JSON reply therefore came from something in front of it — the dev
    // proxy with nothing to forward to, or a gateway — not from the API.
    if (res.status >= 500) throw new ApiError(0, UNREACHABLE);
    throw new ApiError(res.status, `Server returned an unreadable ${res.status} response.`);
  }

  if (!res.ok) {
    // One transparent refresh-and-retry on an expired access token. The
    // refresh cookie may still be valid even when the access token isn't.
    const expired = res.status === 401 && /expired/i.test(payload.message || "");
    if (expired && retry) {
      refreshPromise = refreshPromise || refreshTokens().finally(() => {
        refreshPromise = null;
      });
      await refreshPromise;
      return request(path, { method, body, params, retry: false });
    }

    if (res.status === 401) {
      tokens.clear();
      onSessionExpired();
    }

    throw new ApiError(res.status, payload.message || "Request failed", payload.errors);
  }

  // Unwrap the API envelope; keep `meta` reachable for paginated callers.
  if (payload && typeof payload === "object" && "data" in payload) {
    const body = payload.meta
      ? Object.assign(
          Array.isArray(payload.data) ? [...payload.data] : { ...payload.data },
          { meta: payload.meta }
        )
      : payload.data;
    return withMessage(body, payload.message);
  }
  return payload;
}

/**
 * Keeps the API's own success message reachable as `__message`.
 *
 * Only `data` used to survive this function, and some of those messages carry
 * the only copy of something: a generated temporary password is emailed, and
 * when there is no mail server the server hands it back in the message instead
 * — deliberately, so whoever created the account can pass it on. That was being
 * dropped here, which meant an account could be created that nobody, not even
 * its creator, knew the password for.
 *
 * Non-enumerable on purpose. Responses get spread into request bodies and into
 * component state all over this app; an ordinary property would ride along and
 * change the shape of things that have nothing to do with it.
 */
const withMessage = (body, message) => {
  if (!message || body === null || typeof body !== "object") return body;
  Object.defineProperty(body, "__message", {
    value: message,
    enumerable: false,
    configurable: true,
  });
  return body;
};

export const http = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  delete: (path) => request(path, { method: "DELETE" }),
};
