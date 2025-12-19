import { QueryClient, QueryFunction } from "@tanstack/react-query";

type ApiErrorResponse = {
  ok?: boolean;
  error?: { code?: string; message?: string; details?: unknown };
  message?: string;
};

function buildError(message: string, status: number, code?: string, details?: unknown) {
  const error = new Error(message);
  (error as any).status = status;
  (error as any).code = code;
  (error as any).details = details;
  return error;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let bodyText = "";
    let parsed: ApiErrorResponse | undefined;

    try {
      bodyText = await res.text();
      if (bodyText) {
        if (contentType.includes("application/json")) {
          parsed = JSON.parse(bodyText);
        } else {
          parsed = JSON.parse(bodyText);
        }
      }
    } catch {
      // ignore parse errors
    }

    const code = parsed?.error?.code;
    const details = parsed?.error?.details;
    const message =
      parsed?.error?.message ||
      parsed?.message ||
      bodyText ||
      res.statusText ||
      `Request failed with status ${res.status}`;

    throw buildError(message, res.status, code, details);
  }
}

export function getErrorMessage(error: unknown): string {
  const err = error as any;
  return err?.message || "حدث خطأ";
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
