import {
  PlaywrightBrowserAdapter,
  type BrowserTarget,
} from "@ego-lite/browser-adapter";
import type {
  BrowserObservation,
  ObservationQuery,
  Target,
} from "./types.js";
import { SecurityCoreDataProvider } from "./core-provider.js";

function browserTarget(target: Target): BrowserTarget {
  const environment = target.environment;
  return {
    id: target.id,
    url: target.url,
    environment: environment === "development" || environment === "test" || environment === "staging" || environment === "production"
      ? environment
      : "unknown",
  };
}

/** Provider that lazily starts an isolated Playwright page for a configured target. */
export class PlaywrightDataProvider extends SecurityCoreDataProvider {
  private readonly browser = new PlaywrightBrowserAdapter();

  override async getObservation(input: ObservationQuery): Promise<BrowserObservation | null> {
    const existing = await super.getObservation(input);
    if (existing) return existing;
    const target = super.listTargets().find((item) => item.id === input.targetId);
    if (!target) return null;

    const observation = await this.browser.open(browserTarget(target), (event) => {
      this.addBrowserRequest(target.id, event);
    });
    const result: BrowserObservation = {
      id: observation.id,
      targetId: target.id,
      capturedAt: observation.capturedAt,
      url: observation.url,
      title: observation.title,
      snapshot: observation.text,
      metadata: {
        links: observation.links.length,
        forms: observation.forms.length,
      },
    };
    this.addObservation(result);
    this.addPageAnalysis(target.id, observation.analysis, { title: observation.title });
    return result;
  }

  async close(): Promise<void> {
    await this.browser.close();
    super.close();
  }
}
