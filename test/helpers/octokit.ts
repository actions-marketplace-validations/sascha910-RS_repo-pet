/**
 * Ein Octokit-Double, bei dem jeder nicht vorbereitete Zugriff auffliegt.
 *
 * Der Punkt ist die Umkehrung: eine Liste verbotener Schreibmethoden waere
 * nur so gut wie ihre Vollstaendigkeit. Eine Liste erlaubter Routen ist
 * vollstaendig – was nicht drinsteht, kommt nicht durch. Genau das braucht
 * der Test "dry_run schreibt nichts".
 */

import type { Octokit } from "../../src/stats.js";

export interface FakeCall {
  readonly route: string;
  readonly params: Record<string, unknown>;
}

/** Antwortet auf eine Route. Werfen ist erlaubt – so entstehen 404 und 403. */
export type Route = (params: Record<string, unknown>) => unknown;

export interface FakeOctokit {
  readonly octokit: Octokit;
  /** Jeder Aufruf in Reihenfolge, mit Parametern. */
  readonly calls: FakeCall[];
  /** Nur die Routennamen – bequem fuer Mengenvergleiche. */
  readonly routes: () => string[];
}

/** Ein HTTP-Fehler, wie Octokit ihn wirft. */
export function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

/** Die Lese-Endpunkte, die `collectStats()` anfasst. Leere Antworten. */
const READ_DEFAULTS: Record<string, Route> = {
  "repos.listCommits": () => [],
  "issues.listForRepo": () => [],
  "actions.listWorkflowRunsForRepo": () => ({ workflow_runs: [] }),
};

export function fakeOctokit(routes: Record<string, Route> = {}): FakeOctokit {
  const table = { ...READ_DEFAULTS, ...routes };
  const calls: FakeCall[] = [];

  const method = (route: string) =>
    Object.assign(
      async (params: Record<string, unknown> = {}) => {
        calls.push({ route, params });
        const handler = table[route];
        if (!handler) throw new Error(`Unerwarteter API-Aufruf: ${route}`);
        return { data: handler(params) };
      },
      { route },
    );

  /** Namensraum, der jede Methode kennt – unbekannte werfen beim Aufruf. */
  const namespace = (label: string): unknown =>
    new Proxy(
      {},
      {
        get: (_target, name: string) => method(`${label}.${String(name)}`),
      },
    );

  const rest = new Proxy({} as Record<string, unknown>, {
    get: (_target, name: string) => namespace(String(name)),
  });

  const octokit = {
    rest,
    paginate: {
      async *iterator(endpoint: { route: string }, params: Record<string, unknown>) {
        calls.push({ route: `paginate:${endpoint.route}`, params });
        const handler = table[endpoint.route];
        if (!handler) throw new Error(`Unerwarteter API-Aufruf: paginate:${endpoint.route}`);
        yield { data: handler(params) };
      },
    },
  };

  return {
    octokit: octokit as unknown as Octokit,
    calls,
    routes: () => calls.map((call) => call.route),
  };
}
