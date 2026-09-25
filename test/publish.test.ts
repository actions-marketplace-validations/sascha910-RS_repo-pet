import { describe, expect, it } from "vitest";

import { gitBlobSha, publishSvg, type PublishRequest } from "../src/publish.js";
import { fakeOctokit, httpError, type Route } from "./helpers/octokit.js";

const REQUEST: PublishRequest = {
  owner: "ich",
  repo: "meins",
  branch: "pet-output",
  path: "pet.svg",
  content: "<svg/>",
  message: "repo-pet: content",
};

/** 404, wie die API ihn fuer fehlende Refs und Dateien liefert. */
const notFound: Route = () => {
  throw httpError(404, "Not Found");
};

/** Die drei Schreibrouten, mit festen SHAs zum Wiedererkennen. */
const writeRoutes: Record<string, Route> = {
  "git.createTree": () => ({ sha: "tree-neu" }),
  "git.createCommit": () => ({ sha: "commit-neu" }),
  "git.createRef": () => ({ ref: "refs/heads/pet-output" }),
  "git.updateRef": () => ({ ref: "refs/heads/pet-output" }),
};

describe("gitBlobSha – dieselbe Identitaet, die Git benutzt", () => {
  it("stimmt mit `git hash-object` ueberein", () => {
    // Referenzwerte stammen aus `printf '...' | git hash-object --stdin`.
    expect(gitBlobSha("hello")).toBe("b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0");
    expect(gitBlobSha("<svg/>")).toBe("950ddbbd87f70356e400dbd9eb234b9447dfccab");
  });

  it("zaehlt Bytes, nicht Zeichen", () => {
    // "\u00e4" ist ein Zeichen, aber zwei Bytes in UTF-8. Waere die Laenge
    // in Zeichen gezaehlt, meldete der Vergleich beim ersten Umlaut im
    // aria-label stillschweigend fuer immer "geaendert".
    const zweiBytes = "\u00e4";
    expect(Buffer.byteLength(zweiBytes, "utf8")).toBe(2);
    expect(gitBlobSha(zweiBytes)).not.toBe(gitBlobSha("aa"));
    expect(gitBlobSha(zweiBytes)).toHaveLength(40);
  });
});

describe("publishSvg – Branch existiert nicht", () => {
  it("legt einen Orphan an: Baum ohne base_tree, Commit ohne Eltern", async () => {
    const { octokit, calls, routes } = fakeOctokit({ "git.getRef": notFound, ...writeRoutes });

    const result = await publishSvg(octokit, REQUEST);

    expect(result).toEqual({ outcome: "created", commitSha: "commit-neu" });
    expect(routes()).toEqual([
      "git.getRef",
      "git.createTree",
      "git.createCommit",
      "git.createRef",
    ]);

    const tree = calls.find((call) => call.route === "git.createTree");
    expect(tree?.params["base_tree"]).toBeUndefined();
    expect(tree?.params["tree"]).toEqual([
      { path: "pet.svg", mode: "100644", type: "blob", content: "<svg/>" },
    ]);

    const commit = calls.find((call) => call.route === "git.createCommit");
    expect(commit?.params["parents"]).toEqual([]);
    // Kein fest verdrahteter Bot-Name: der Commit soll ausweisen, wer ihn
    // wirklich gemacht hat.
    expect(commit?.params["author"]).toBeUndefined();
    expect(commit?.params["committer"]).toBeUndefined();

    expect(calls.find((call) => call.route === "git.createRef")?.params["ref"]).toBe(
      "refs/heads/pet-output",
    );
  });

  it("fragt gar nicht erst nach der Datei", async () => {
    const { octokit, routes } = fakeOctokit({ "git.getRef": notFound, ...writeRoutes });
    await publishSvg(octokit, REQUEST);
    expect(routes()).not.toContain("repos.getContent");
  });
});

describe("publishSvg – Branch existiert", () => {
  const head = { "git.getRef": () => ({ object: { sha: "commit-alt" } }) };

  it("committet auf die Spitze und behaelt den bestehenden Baum", async () => {
    const { octokit, calls, routes } = fakeOctokit({
      ...head,
      "repos.getContent": () => ({ type: "file", sha: gitBlobSha("etwas anderes") }),
      ...writeRoutes,
    });

    const result = await publishSvg(octokit, REQUEST);

    expect(result).toEqual({ outcome: "updated", commitSha: "commit-neu" });
    expect(routes()).toEqual([
      "git.getRef",
      "repos.getContent",
      "git.createTree",
      "git.createCommit",
      "git.updateRef",
    ]);

    // base_tree erhaelt, was jemand sonst noch im Branch abgelegt hat.
    expect(calls.find((call) => call.route === "git.createTree")?.params["base_tree"]).toBe(
      "commit-alt",
    );
    expect(calls.find((call) => call.route === "git.createCommit")?.params["parents"]).toEqual([
      "commit-alt",
    ]);
    // Kein force: fremde Arbeit wird nicht ueberschrieben.
    expect(calls.find((call) => call.route === "git.updateRef")?.params["force"]).toBe(false);
  });

  it("fehlt nur die Datei, wird sie in den bestehenden Baum gelegt", async () => {
    const { octokit, calls, routes } = fakeOctokit({
      ...head,
      "repos.getContent": notFound,
      ...writeRoutes,
    });

    const result = await publishSvg(octokit, REQUEST);

    expect(result.outcome).toBe("updated");
    expect(routes()).toContain("git.updateRef");
    expect(calls.find((call) => call.route === "git.createTree")?.params["base_tree"]).toBe(
      "commit-alt",
    );
  });
});

describe("publishSvg – SVG unveraendert", () => {
  it("erzeugt keinen einzigen Schreibaufruf", async () => {
    const { octokit, routes } = fakeOctokit({
      "git.getRef": () => ({ object: { sha: "commit-alt" } }),
      // Genau derselbe Inhalt: die API meldet denselben Blob-SHA.
      "repos.getContent": () => ({ type: "file", sha: gitBlobSha(REQUEST.content) }),
    });

    const result = await publishSvg(octokit, REQUEST);

    expect(result).toEqual({ outcome: "unchanged", commitSha: null });
    // Die Schreibrouten sind hier gar nicht erst vorbereitet – waere eine
    // aufgerufen worden, haette der Helfer geworfen. Zusaetzlich explizit:
    expect(routes()).toEqual(["git.getRef", "repos.getContent"]);
  });
});

describe("publishSvg – fehlende Rechte", () => {
  it("reicht den 403 durch, statt ihn zu verschlucken", async () => {
    const { octokit } = fakeOctokit({
      "git.getRef": () => ({ object: { sha: "commit-alt" } }),
      "repos.getContent": notFound,
      "git.createTree": () => {
        throw httpError(403, "Resource not accessible by integration");
      },
    });

    await expect(publishSvg(octokit, REQUEST)).rejects.toMatchObject({ status: 403 });
  });

  it("ein 404 auf getRef ist kein Fehler, sondern ein fehlender Branch", async () => {
    // Die Unterscheidung ist der Grund fuer `orNotFound()`: 404 heisst hier
    // "gibt es noch nicht", waehrend 403 bedeutet "darfst du nicht".
    const { octokit } = fakeOctokit({ "git.getRef": notFound, ...writeRoutes });
    await expect(publishSvg(octokit, REQUEST)).resolves.toMatchObject({ outcome: "created" });
  });
});

describe("publishSvg – Pfad zeigt auf ein Verzeichnis", () => {
  it("bricht mit klarer Meldung ab, statt zu committen", async () => {
    const { octokit, routes } = fakeOctokit({
      "git.getRef": () => ({ object: { sha: "commit-alt" } }),
      // Die Contents-API liefert fuer ein Verzeichnis ein Array.
      "repos.getContent": () => [{ name: "pet.svg" }],
    });

    await expect(publishSvg(octokit, REQUEST)).rejects.toThrow(/Verzeichnis/);
    expect(routes()).not.toContain("git.createTree");
  });
});
