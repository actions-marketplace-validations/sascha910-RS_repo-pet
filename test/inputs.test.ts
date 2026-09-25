import { describe, expect, it } from "vitest";

import { InputError, readInputs, type InputSource } from "../src/inputs.js";

/** Baut eine Input-Quelle aus einer schlichten Tabelle. */
function source(inputs: Record<string, string>, env: Record<string, string> = {}): InputSource {
  return { getInput: (name) => inputs[name] ?? "", env };
}

const VALID = {
  github_token: "ghs_token",
  output_branch: "pet-output",
  output_filename: "pet.svg",
  repository: "owner/repo",
  dry_run: "false",
};

describe("readInputs – Pflichtangaben", () => {
  it("ohne Token kommt ein Hinweis, der die Loesung enthaelt", () => {
    // `required: true` in action.yml ist Dokumentation, keine Pruefung –
    // deshalb muss der Fehler hier entstehen und brauchbar sein.
    const call = () => readInputs(source({ ...VALID, github_token: "" }));
    expect(call).toThrow(InputError);
    expect(call).toThrow(/github\.token/);
  });

  it("leerer output_branch wird abgelehnt", () => {
    expect(() => readInputs(source({ ...VALID, output_branch: "" }))).toThrow(InputError);
  });
});

describe("readInputs – gemessenes Repo und Commit-Ziel", () => {
  it("ohne repository-Input greift GITHUB_REPOSITORY", () => {
    const inputs = readInputs(
      source({ ...VALID, repository: "" }, { GITHUB_REPOSITORY: "kontext/repo" }),
    );
    expect(inputs.source).toEqual({ owner: "kontext", repo: "repo" });
  });

  it("geschrieben wird ins Workflow-Repo, gemessen am angegebenen", () => {
    // Der interessante Fall: ein fremdes Repo beobachten. Die svg_url muss
    // dann trotzdem ins eigene Repo zeigen.
    const inputs = readInputs(
      source({ ...VALID, repository: "fremd/projekt" }, { GITHUB_REPOSITORY: "ich/meins" }),
    );
    expect(inputs.source).toEqual({ owner: "fremd", repo: "projekt" });
    expect(inputs.target).toEqual({ owner: "ich", repo: "meins" });
  });

  it("ohne Kontext faellt das Ziel mit der Quelle zusammen", () => {
    const inputs = readInputs(source(VALID));
    expect(inputs.target).toEqual(inputs.source);
  });

  it("was kein owner/repo ist, fliegt auf", () => {
    for (const bad of ["kein-slash", "zu/viele/teile", "owner/", "/repo", ""]) {
      expect(() => readInputs(source({ ...VALID, repository: bad }))).toThrow(InputError);
    }
  });
});

describe("readInputs – dry_run", () => {
  it('"true" und "false" in jeder Schreibweise', () => {
    expect(readInputs(source({ ...VALID, dry_run: "true" })).dryRun).toBe(true);
    expect(readInputs(source({ ...VALID, dry_run: "TRUE" })).dryRun).toBe(true);
    expect(readInputs(source({ ...VALID, dry_run: "false" })).dryRun).toBe(false);
  });

  it("nicht gesetzt bedeutet false, nicht Absturz", () => {
    // core.getBooleanInput() wuerde hier werfen. Ausserhalb eines Workflows
    // ist "nicht gesetzt" aber der Normalfall.
    expect(readInputs(source({ ...VALID, dry_run: "" })).dryRun).toBe(false);
  });

  it("alles andere ist ein Fehler, kein stilles false", () => {
    expect(() => readInputs(source({ ...VALID, dry_run: "ja" }))).toThrow(InputError);
    expect(() => readInputs(source({ ...VALID, dry_run: "1" }))).toThrow(InputError);
  });
});

describe("readInputs – output_filename", () => {
  it("Unterordner sind erlaubt", () => {
    expect(readInputs(source({ ...VALID, output_filename: "assets/pet.svg" })).outputFilename).toBe(
      "assets/pet.svg",
    );
  });

  it("Ausbruch aus dem Baum nicht", () => {
    for (const bad of ["", "/pet.svg", "../pet.svg", "a/../../pet.svg"]) {
      expect(() => readInputs(source({ ...VALID, output_filename: bad }))).toThrow(InputError);
    }
  });
});
