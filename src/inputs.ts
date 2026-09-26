/**
 * Die Inputs der Action: lesen, pruefen, in getypte Werte verwandeln.
 *
 * Das ist die einzige Stelle, an der Strings aus einer Workflow-Datei
 * ankommen. Alles dahinter rechnet mit `ActionInputs` – dieselbe Linie, die
 * `RepoStats` zwischen Netzwerk und Logik zieht.
 *
 * Wichtig: `required: true` in `action.yml` ist **Dokumentation, keine
 * Pruefung**. Der Runner erzwingt es fuer JavaScript-Actions nicht. Was hier
 * nicht geprueft wird, faellt spaeter als unverstaendlicher API-Fehler auf.
 */

/** Ein Repo, auf das sich ein Aufruf bezieht. */
export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

/**
 * Woran gemessen wird: an einem Repo oder an einer Person.
 *
 * Als unterschiedene Union und nicht als zwei optionale Felder – so kann der
 * Ablauf in `main.ts` nicht versehentlich beides oder keines behandeln, und
 * der Typecheck erzwingt, dass jeder neue Fall ueberall mitgezogen wird.
 */
export type Subject =
  | { readonly kind: "repo"; readonly repo: RepoRef }
  | { readonly kind: "user"; readonly login: string };

/** Menschenlesbar, fuer Log und Zusammenfassung. */
export function describeSubject(subject: Subject): string {
  return subject.kind === "repo" ? `${subject.repo.owner}/${subject.repo.repo}` : `@${subject.login}`;
}

export interface ActionInputs {
  readonly githubToken: string;
  /** Was gemessen wird – Input `repository` oder `user`. */
  readonly subject: Subject;
  /**
   * Repo, in das committet wird – immer das, in dem der Workflow laeuft.
   *
   * Getrennt von `source`, weil beides auseinanderfallen darf: man kann ein
   * fremdes Repo beobachten, aber schreiben kann man nur ins eigene. Waeren
   * es dieselben Felder, zeigte die `svg_url` in dem Fall ins falsche Repo.
   */
  readonly target: RepoRef;
  readonly outputBranch: string;
  readonly outputFilename: string;
  readonly dryRun: boolean;
}

/**
 * Was `readInputs()` von der Aussenwelt braucht.
 *
 * Als Struktur statt als Import von `@actions/core`, damit Tests die Inputs
 * hinstellen koennen, ohne ein Modul zu moecken.
 */
export interface InputSource {
  /** Rohwert eines Inputs, `""` wenn nicht gesetzt. */
  readonly getInput: (name: string) => string;
  /** Prozessumgebung – fuer den Fallback auf `GITHUB_REPOSITORY`. */
  readonly env: Readonly<Record<string, string | undefined>>;
}

/**
 * GitHub-Benutzernamen: Buchstaben, Ziffern und einzelne Bindestriche,
 * hoechstens 39 Zeichen. Streng geprueft, weil ein Tippfehler sonst als
 * "nicht gefunden" aus der API zurueckkommt und wie ein Rechteproblem
 * aussieht.
 */
const LOGIN_PATTERN = /^[A-Za-z\d](?:[A-Za-z\d]|-(?=[A-Za-z\d])){0,38}$/;

/** Fehler in der Workflow-Konfiguration, nicht in der Action. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/**
 * Zerlegt `owner/repo`.
 *
 * Bewusst streng: ein Tippfehler hier ergibt sonst einen 404 aus der API,
 * und der sieht aus wie ein Rechteproblem.
 */
export function parseRepoRef(value: string, label: string): RepoRef {
  const match = /^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(value.trim());
  if (!match?.[1] || !match[2]) {
    throw new InputError(`${label}: "${value}" is not in owner/repo form.`);
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * `"true"` / `"false"`, leer bedeutet `false`.
 *
 * Eigene Auswertung statt `core.getBooleanInput()`, weil das bei einem
 * fehlenden Input wirft. Beim Aufruf ausserhalb eines Workflows – etwa im
 * Test oder beim lokalen Durchspielen – ist "nicht gesetzt" aber ein voellig
 * normaler Fall und soll einfach der Default sein.
 */
export function parseBoolean(value: string, label: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new InputError(`${label}: "${value}" is neither "true" nor "false".`);
}

/**
 * Prueft den Dateinamen im Output-Branch.
 *
 * Unterordner sind erlaubt (`assets/pet.svg`), ein Ausbruch daraus nicht.
 * Die Git-Data-API wuerde `../` klaglos als Pfadbestandteil schlucken und
 * einen Baum mit einem Eintrag anlegen, den kein Checkout mehr auspackt.
 */
export function checkFilename(value: string): string {
  const name = value.trim();
  if (name === "") throw new InputError("output_filename is empty.");
  if (name.startsWith("/")) throw new InputError(`output_filename: "${name}" must not start with a slash.`);
  if (name.split("/").includes("..")) throw new InputError(`output_filename: "${name}" must not contain "..".`);
  return name;
}

/** Liest und prueft alle Inputs. Wirft `InputError` mit klarem Text. */
export function readInputs(source: InputSource): ActionInputs {
  const githubToken = source.getInput("github_token").trim();
  if (githubToken === "") {
    throw new InputError(
      "github_token is missing. The usual value is the github.token expression, " +
        "passed in the action's with block.",
    );
  }

  // Das beobachtete Repo kommt aus dem Input; dessen Default in action.yml ist
  // `${{ github.repository }}`. Faellt der weg – etwa beim lokalen Aufruf –
  // greift dieselbe Umgebungsvariable, aus der der Ausdruck gespeist wird.
  const repositoryInput = source.getInput("repository").trim();
  const contextRepository = (source.env["GITHUB_REPOSITORY"] ?? "").trim();
  const sourceValue = repositoryInput !== "" ? repositoryInput : contextRepository;
  if (sourceValue === "") {
    throw new InputError("repository is empty and GITHUB_REPOSITORY is not set.");
  }

  // Geschrieben wird immer ins Repo des laufenden Workflows. Nur wenn es das
  // nicht gibt (lokaler Lauf), faellt das Ziel mit der Quelle zusammen.
  const targetValue = contextRepository !== "" ? contextRepository : sourceValue;

  const outputBranch = source.getInput("output_branch").trim();
  if (outputBranch === "") throw new InputError("output_branch is empty.");

  // `user` schlaegt `repository`. Ein Fehler bei beiden waere hier nicht
  // umsetzbar: `repository` hat in action.yml den Default
  // `${{ github.repository }}` und ist im Workflow damit immer gesetzt -
  // "ausdruecklich angegeben" laesst sich von "Default" nicht unterscheiden.
  const login = source.getInput("user").trim();
  if (login !== "" && !LOGIN_PATTERN.test(login)) {
    throw new InputError(`user: "${login}" is not a GitHub username.`);
  }
  const subject: Subject =
    login !== ""
      ? { kind: "user", login }
      : { kind: "repo", repo: parseRepoRef(sourceValue, "repository") };

  return {
    githubToken,
    subject,
    target: parseRepoRef(targetValue, "GITHUB_REPOSITORY"),
    outputBranch,
    outputFilename: checkFilename(source.getInput("output_filename")),
    dryRun: parseBoolean(source.getInput("dry_run"), "dry_run"),
  };
}
