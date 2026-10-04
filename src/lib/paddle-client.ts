/**
 * Paddle.js, loaded from Paddle's CDN only when someone opens checkout on the billing page (no package, no tracking
 * elsewhere in the app). Just the few calls we use are typed.
 */

type PaddleEvent = { name?: string };

export type PaddleJs = {
  Environment: { set: (environment: "sandbox" | "production") => void };
  Initialize: (options: { token: string; eventCallback?: (event: PaddleEvent) => void }) => void;
  Checkout: {
    open: (options: {
      items: { priceId: string; quantity: number }[];
      customer?: { id?: string; email?: string };
      customData?: Record<string, string>;
      settings?: { displayMode?: "overlay"; theme?: "light" | "dark"; successUrl?: string; locale?: string };
    }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

const SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";
let loading: Promise<PaddleJs> | null = null;
let initialisedWith: string | null = null;
let onEvent: (event: PaddleEvent) => void = () => undefined;

export function loadPaddle(): Promise<PaddleJs> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Paddle) return Promise.resolve(window.Paddle);
  loading ??= new Promise<PaddleJs>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.Paddle ? resolve(window.Paddle) : reject(new Error("Paddle.js did not load")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Paddle.js could not be loaded"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Initialise once per token; `handler` receives checkout events (e.g. "checkout.completed"). */
export async function openCheckout(
  details: { environment: "sandbox" | "production"; clientToken: string; priceId: string; customerId: string; customData: Record<string, string>; successUrl: string },
  handler: (event: PaddleEvent) => void,
): Promise<void> {
  const paddle = await loadPaddle();
  onEvent = handler;
  if (initialisedWith !== details.clientToken) {
    if (details.environment === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({ token: details.clientToken, eventCallback: (event) => onEvent(event) });
    initialisedWith = details.clientToken;
  }
  paddle.Checkout.open({
    items: [{ priceId: details.priceId, quantity: 1 }],
    customer: { id: details.customerId },
    customData: details.customData,
    settings: { displayMode: "overlay", theme: "light", successUrl: details.successUrl },
  });
}
