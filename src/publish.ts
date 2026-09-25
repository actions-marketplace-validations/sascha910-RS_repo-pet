/**
 * Ablegen des SVG im Output-Branch – ueber die Git-Data-API, ohne Checkout.
 *
 * Kein `actions/checkout`, kein `git commit`, kein Arbeitsverzeichnis: die
 * Action baut Baum und Commit direkt als API-Objekte. Das spart nicht nur
 * Zeit, es macht den Output-Branch auch unabhaengig davon, was gerade
 * ausgecheckt ist – ein Orphan-Branch laesst sich mit einem Checkout des
 * Default-Branches ohnehin nicht bearbeiten.
 */

import { createHash } from "node:crypto";

import type { Octokit } from "./stats.js";

/** Was am Ende passiert ist. */
export type PublishOutcome = "unchanged" | "created" | "updated";

export interface PublishResult {
  readonly outcome: PublishOutcome;
  /** SHA des erzeugten Commits, `null` wenn keiner noetig war. */
  readonly commitSha: string | null;
}

export interface PublishRequest {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly content: string;
  readonly message: string;
}

/** Dateimodus fuer eine normale, nicht ausfuehrbare Datei. */
const FILE_MODE = "100644";

/**
 * Der Git-Blob-Hash eines Inhalts: `sha1("blob " + Laenge + "\0" + Inhalt)`.
 *
 * Damit laesst sich "hat sich etwas geaendert?" beantworten, ohne die alte
 * Datei herunterzuladen – die Contents-API liefert den Blob-SHA gleich mit.
 * Es ist dieselbe Identitaet, die Git selbst verwendet; `git hash-object`
 * liefert exakt diesen Wert, und ein Test prueft das gegen feste Hashes.
 *
 * Die Laenge zaehlt Bytes, nicht Zeichen. Bei einem SVG, das nur ASCII
 * enthaelt, faellt der Unterschied nie auf – bis eines Tages ein Umlaut in
 * einem `aria-label` landet und der Vergleich still immer "geaendert" sagt.
 */
export function gitBlobSha(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`, "utf8")
    .update(bytes)
    .digest("hex");
}

/** Liefert `null` statt zu werfen, wenn die Ressource schlicht nicht da ist. */
async function orNotFound<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (error) {
    if ((error as { status?: number } | null)?.status === 404) return null;
    throw error;
  }
}

/** Commit-SHA der Branch-Spitze, oder `null` wenn es den Branch nicht gibt. */
async function headCommitSha(octokit: Octokit, request: PublishRequest): Promise<string | null> {
  const response = await orNotFound(() =>
    octokit.rest.git.getRef({
      owner: request.owner,
      repo: request.repo,
      ref: `heads/${request.branch}`,
    }),
  );
  return response ? response.data.object.sha : null;
}

/** Blob-SHA der vorhandenen Datei, oder `null` wenn sie im Branch fehlt. */
async function existingBlobSha(octokit: Octokit, request: PublishRequest): Promise<string | null> {
  const response = await orNotFound(() =>
    octokit.rest.repos.getContent({
      owner: request.owner,
      repo: request.repo,
      path: request.path,
      ref: request.branch,
    }),
  );
  if (!response) return null;

  // Zeigt der Pfad auf ein Verzeichnis, liefert die API ein Array. Dann ist
  // die Konfiguration falsch, und ein Commit wuerde es nur schlimmer machen.
  const data = response.data as unknown;
  if (Array.isArray(data)) {
    throw new Error(
      `output_filename "${request.path}" ist im Branch "${request.branch}" ein Verzeichnis.`,
    );
  }
  const file = data as { sha?: string; type?: string };
  return file.type === "file" && file.sha ? file.sha : null;
}

/**
 * Legt Baum und Commit an und setzt den Branch darauf.
 *
 * `parentSha === null` erzeugt einen Orphan: ein Commit ohne Eltern und ein
 * Baum ohne `base_tree`. Der Branch enthaelt danach genau diese eine Datei
 * und nichts vom Repo-Code.
 *
 * Existiert der Branch dagegen schon, wird `base_tree` mitgegeben. Das ist
 * Absicht: wer dort spaeter von Hand ein README abgelegt hat, das erklaert,
 * wozu der Branch da ist, soll es nicht beim naechsten Lauf verlieren.
 */
async function commitFile(
  octokit: Octokit,
  request: PublishRequest,
  parentSha: string | null,
  baseTreeSha: string | null,
): Promise<string> {
  const tree = await octokit.rest.git.createTree({
    owner: request.owner,
    repo: request.repo,
    ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
    // Inhalt direkt im Baum statt vorher als Blob: spart einen API-Aufruf,
    // und den Blob-SHA brauchen wir hier nicht mehr.
    tree: [{ path: request.path, mode: FILE_MODE, type: "blob", content: request.content }],
  });

  const commit = await octokit.rest.git.createCommit({
    owner: request.owner,
    repo: request.repo,
    message: request.message,
    tree: tree.data.sha,
    parents: parentSha ? [parentSha] : [],
    // Kein author/committer: so steht im Log, wer den Commit wirklich
    // gemacht hat. Mit GITHUB_TOKEN ist das github-actions[bot], mit einem
    // PAT die Person dahinter – ein fest verdrahteter Bot-Name wuerde den
    // zweiten Fall falsch ausweisen.
  });

  const ref = `heads/${request.branch}`;
  if (parentSha) {
    await octokit.rest.git.updateRef({
      owner: request.owner,
      repo: request.repo,
      ref,
      sha: commit.data.sha,
      // Kein force: hat jemand zwischendurch geschoben, soll der Lauf
      // fehlschlagen statt fremde Arbeit zu ueberschreiben.
      force: false,
    });
  } else {
    await octokit.rest.git.createRef({
      owner: request.owner,
      repo: request.repo,
      ref: `refs/${ref}`,
      sha: commit.data.sha,
    });
  }

  return commit.data.sha;
}

/**
 * Legt das SVG ab, falls noetig.
 *
 * Ist der Inhalt unveraendert, passiert **nichts** – kein Commit, kein
 * Schreibzugriff. Bei einem taeglichen Lauf ist das der Normalfall: der
 * Zustand eines Repos aendert sich seltener als einmal am Tag, und eine
 * Historie aus identischen Commits waere nur Rauschen.
 */
export async function publishSvg(
  octokit: Octokit,
  request: PublishRequest,
): Promise<PublishResult> {
  const parentSha = await headCommitSha(octokit, request);

  if (parentSha === null) {
    const commitSha = await commitFile(octokit, request, null, null);
    return { outcome: "created", commitSha };
  }

  const existing = await existingBlobSha(octokit, request);
  if (existing !== null && existing === gitBlobSha(request.content)) {
    return { outcome: "unchanged", commitSha: null };
  }

  // Der Commit-SHA taugt als base_tree: die API nimmt an dieser Stelle auch
  // einen Commit und loest ihn auf seinen Baum auf.
  const commitSha = await commitFile(octokit, request, parentSha, parentSha);
  return { outcome: "updated", commitSha };
}
