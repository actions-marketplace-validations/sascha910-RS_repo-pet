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
    expect(inputs.subject).toEqual({ kind: "repo", repo: { owner: "kontext", repo: "repo" } });
  });

  it("geschrieben wird ins Workflow-Repo, gemessen am angegebenen", () => {
    // Der interessante Fall: ein fremdes Repo beobachten. Die svg_url muss
    // dann trotzdem ins eigene Repo zeigen.
    const inputs = readInputs(
      source({ ...VALID, repository: "fremd/projekt" }, { GITHUB_REPOSITORY: "ich/meins" }),
    );
    expect(inputs.subject).toEqual({ kind: "repo", repo: { owner: "fremd", repo: "projekt" } });
    expect(inputs.target).toEqual({ owner: "ich", repo: "meins" });
  });

  it("ohne Kontext faellt das Ziel mit der Quelle zusammen", () => {
    const inputs = readInputs(source(VALID));
    expect(inputs.subject).toEqual({ kind: "repo", repo: inputs.target });
  });

  it("was kein owner/repo ist, fliegt auf", () => {
    for (const bad of ["kein-slash", "zu/viele/teile", "owner/", "/repo", ""]) {
      expect(() => readInputs(source({ ...VALID, repository: bad }))).toThrow(InputError);
    }
  });
});

describe("readInputs – user statt repository", () => {
  it("ein gesetzter user macht die Person zum Messobjekt", () => {
    const inputs = readInputs(source({ ...VALID, user: "octocat" }));
    expect(inputs.subject).toEqual({ kind: "user", login: "octocat" });
  });

  it("user schlaegt repository, auch wenn beides dasteht", () => {
    // Ein Fehler bei beidem ginge nicht: `repository` hat in action.yml den
    // Default `${{ github.repository }}` und ist im Workflow damit immer
    // gesetzt - "ausdruecklich angegeben" ist nicht unterscheidbar.
    const inputs = readInputs(source({ ...VALID, user: "octocat", repository: "fremd/projekt" }));
    expect(inputs.subject).toEqual({ kind: "user", login: "octocat" });
  });

  it("das Commit-Ziel bleibt davon unberuehrt", () => {
    const inputs = readInputs(
      source({ ...VALID, user: "octocat" }, { GITHUB_REPOSITORY: "ich/meins" }),
    );
    expect(inputs.target).toEqual({ owner: "ich", repo: "meins" });
  });

  it("was kein Benutzername ist, fliegt auf", () => {
    // Sonst kommt der Tippfehler als "nicht gefunden" aus der API zurueck
    // und sieht wie ein Rechteproblem aus.
    for (const bad of ["-octocat", "octocat-", "octo--cat", "octo cat", "a".repeat(40), "octo/cat"]) {
      expect(() => readInputs(source({ ...VALID, user: bad }))).toThrow(InputError);
    }
  });

  it("gueltige Randfaelle gehen durch", () => {
    for (const ok of ["a", "octo-cat", "a".repeat(39), "123"]) {
      expect(readInputs(source({ ...VALID, user: ok })).subject).toEqual({ kind: "user", login: ok });
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
