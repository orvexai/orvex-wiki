import axios, { AxiosInstance } from "axios";
import APP_ROUTE from "@/lib/app-route.ts";
import { isClerkTenancy, isCloud } from "@/lib/config.ts";

const api: AxiosInstance = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => {
    // we need the response headers for these endpoints
    const exemptEndpoints = [
      "/api/pages/export",
      "/api/spaces/export",
      "/api/docx-export",
      "/api/bases/export-csv",
    ];
    if (response.request.responseURL) {
      const path = new URL(response.request.responseURL)?.pathname;
      if (path && exemptEndpoints.includes(path)) {
        return response;
      }
    }

    return response.data;
  },
  (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401: {
          const url = new URL(error.request.responseURL)?.pathname;
          if (url === "/api/auth/collab-token") return;
          if (window.location.pathname.startsWith("/share/")) return;

          // Handle unauthorized error
          redirectToLogin();
          break;
        }
        case 403:
          // Handle forbidden error
          break;
        case 404:
          // Handle not found error
          if (
            error.response.data.message
              .toLowerCase()
              .includes("workspace not found")
          ) {
            console.log("workspace not found");
            if (
              !isCloud() &&
              window.location.pathname != APP_ROUTE.AUTH.SETUP
            ) {
              window.location.href = APP_ROUTE.AUTH.SETUP;
            }
          }
          break;
        case 500:
          // Handle internal server error
          break;
        default:
          break;
      }
    }
    return Promise.reject(error);
  },
);

export function redirectToLogin() {
  const exemptPaths = [
    APP_ROUTE.AUTH.LOGIN,
    APP_ROUTE.AUTH.CLERK_LOGIN,
    APP_ROUTE.AUTH.SIGNUP,
    APP_ROUTE.AUTH.FORGOT_PASSWORD,
    APP_ROUTE.AUTH.PASSWORD_RESET,
    APP_ROUTE.AUTH.MFA_CHALLENGE,
    APP_ROUTE.AUTH.MFA_SETUP_REQUIRED,
    "/invites",
  ];
  if (!exemptPaths.some((path) => window.location.pathname.startsWith(path))) {
    // Under Clerk tenancy, identity is delegated to Clerk — the login
    // surface is /clerk, never the local-credentials /login page (CS §6
    // client-shallow: this reads the flag, decides nothing about tenancy).
    const loginRoute = isClerkTenancy()
      ? APP_ROUTE.AUTH.CLERK_LOGIN
      : APP_ROUTE.AUTH.LOGIN;
    const redirectTo = window.location.pathname;
    if (redirectTo === APP_ROUTE.HOME) {
      window.location.href = loginRoute;
    } else {
      const params = new URLSearchParams({ redirect: redirectTo });
      window.location.href = `${loginRoute}?${params.toString()}`;
    }
  }
}

export default api;
