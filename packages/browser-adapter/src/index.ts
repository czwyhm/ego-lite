import {
  analyzePassiveWebSecurity,
  normalizeBrowserRequest,
  redactHeaders,
  redactUrl,
  type NormalizedBrowserRequest,
  type PassiveAnalysisReport,
} from "@ego-lite/security-core";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Response,
} from "playwright";

export type BrowserAdapterOptions = {
  headless?: boolean;
  browserExecutablePath?: string;
  userDataDir?: string;
};

export type PageObservation = {
  id: string;
  targetId: string;
  capturedAt: string;
  url: string;
  title: string;
  text: string;
  links: string[];
  forms: Array<{ method: string; action: string; fields: string[] }>;
  analysis: PassiveAnalysisReport;
};

export type BrowserTarget = {
  id: string;
  url: string;
  environment: "development" | "test" | "staging" | "production" | "unknown";
};

export type BrowserEventListener = (event: NormalizedBrowserRequest) => void;

type PageState = {
  target: BrowserTarget;
  page: Page;
  requests: Map<string, { startedAt: number; url: string; method: string }>;
  listener?: BrowserEventListener;
};

/**
 * Portable browser backend used by the security console. It deliberately
 * records request/response metadata only; response bodies and credentials are
 * never persisted by this adapter.
 */
export class PlaywrightBrowserAdapter {
  private browser?: Browser;
  private context?: BrowserContext;
  private readonly pages = new Map<string, PageState>();

  async launch(options: BrowserAdapterOptions = {}): Promise<void> {
    if (this.context) return;
    if (options.userDataDir) {
      this.context = await chromium.launchPersistentContext(options.userDataDir, {
          headless: options.headless ?? true,
          executablePath: options.browserExecutablePath,
        });
      return;
    }
    this.browser = await chromium.launch({
      headless: options.headless ?? true,
      executablePath: options.browserExecutablePath,
    });
    this.context = await this.browser.newContext();
  }

  async open(
    target: BrowserTarget,
    listener?: BrowserEventListener,
  ): Promise<PageObservation> {
    if (!this.context) await this.launch();
    const page = await this.context!.newPage();
    const state: PageState = {
      target,
      page,
      requests: new Map(),
      listener,
    };
    this.pages.set(target.id, state);
    page.on("request", (request) => {
      state.requests.set(request.url(), {
        startedAt: Date.now(),
        url: request.url(),
        method: request.method(),
      });
    });
    page.on("response", (response) => {
      void this.recordResponse(state, response);
    });
    page.on("requestfailed", (request) => {
      const started = state.requests.get(request.url());
      listener?.(
        normalizeBrowserRequest({
          url: request.url(),
          method: request.method(),
          timestamp: started?.startedAt ?? Date.now(),
          durationMs: started ? Date.now() - started.startedAt : undefined,
          resourceType: request.resourceType(),
          requestHeaders: request.headers(),
        }),
      );
      state.requests.delete(request.url());
    });

    await page.goto(target.url, { waitUntil: "domcontentloaded" });
    return this.observe(target.id);
  }

  async observe(targetId: string): Promise<PageObservation> {
    const state = this.getPage(targetId);
    const page = state.page;
    const [title, text, links, forms] = await Promise.all([
      page.title(),
      page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""),
      page.locator("a[href]").evaluateAll((items) =>
        items.map((item) => (item as HTMLAnchorElement).href).slice(0, 200),
      ),
      page.locator("form").evaluateAll((items) =>
        items.slice(0, 100).map((item) => ({
          method: ((item as HTMLFormElement).method || "GET").toUpperCase(),
          action: (item as HTMLFormElement).action,
          fields: Array.from(item.querySelectorAll("input,textarea,select")).map(
            (field) => (field as HTMLInputElement).name || field.tagName.toLowerCase(),
          ),
        })),
      ),
    ]);
    const response = await page
      .evaluate(() => ({
        url: location.href,
        html: document.documentElement.outerHTML.slice(0, 250_000),
      }))
      .catch(() => ({ url: page.url(), html: "" }));
    const analysis = analyzePassiveWebSecurity({
      url: response.url,
      finalUrl: response.url,
      bodySample: response.html,
      mixedContentUrls: links.filter((link) => link.startsWith("http:")),
    });
    return {
      id: `observation-${Date.now()}`,
      targetId,
      capturedAt: new Date().toISOString(),
      url: redactUrl(response.url) ?? response.url,
      title,
      text: text.slice(0, 50_000),
      links: links.map((link) => redactUrl(link) ?? link),
      forms,
      analysis,
    };
  }

  onEvent(targetId: string, listener: BrowserEventListener): void {
    this.getPage(targetId).listener = listener;
  }

  listTargets(): BrowserTarget[] {
    return [...this.pages.values()].map((state) => state.target);
  }

  async closeTarget(targetId: string): Promise<void> {
    const state = this.pages.get(targetId);
    if (!state) return;
    this.pages.delete(targetId);
    await state.page.close();
  }

  async close(): Promise<void> {
    for (const targetId of [...this.pages.keys()]) await this.closeTarget(targetId);
    await this.context?.close();
    await this.browser?.close();
    this.context = undefined;
    this.browser = undefined;
  }

  private getPage(targetId: string): PageState {
    const state = this.pages.get(targetId);
    if (!state) throw new Error(`Unknown browser target: ${targetId}`);
    return state;
  }

  private async recordResponse(state: PageState, response: Response): Promise<void> {
    const request = response.request();
    const started = state.requests.get(request.url());
    const headers = await response.allHeaders();
    state.listener?.(
      normalizeBrowserRequest({
        url: request.url(),
        responseUrl: response.url(),
        method: request.method(),
        status: response.status(),
        timestamp: started?.startedAt ?? Date.now(),
        durationMs: started ? Date.now() - started.startedAt : undefined,
        resourceType: request.resourceType(),
        requestHeaders: redactHeaders(request.headers()),
        responseHeaders: redactHeaders(headers),
      }),
    );
    state.requests.delete(request.url());
  }
}
