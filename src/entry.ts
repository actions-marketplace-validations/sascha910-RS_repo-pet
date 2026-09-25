/**
 * Einstiegspunkt des gebuendelten Action-Skripts (`dist/index.cjs`).
 *
 * Hier und nur hier wird `@actions/core` angefasst. Die Datei verdrahtet die
 * echte Umgebung mit `runAction()` und uebersetzt einen Fehler in einen
 * roten Schritt – sonst nichts. Sie hat absichtlich keine Logik, weil sie
 * die einzige Datei im Projekt ist, die sich nicht ohne Weiteres testen
 * laesst: sie laeuft beim Import los.
 */

import * as core from "@actions/core";
import { getOctokit } from "@actions/github";

import { readInputs } from "./inputs.js";
import { describeFailure, runAction, type ActionIo } from "./main.js";

/** `@actions/core` in der Form, die `runAction()` erwartet. */
const io: ActionIo = {
  info: (message) => core.info(message),
  warning: (message) => core.warning(message),
  setOutput: (name, value) => core.setOutput(name, value),
  writeSummary: async (markdown) => {
    await core.summary.addRaw(markdown).write();
  },
};

async function main(): Promise<void> {
  try {
    const inputs = readInputs({
      getInput: (name) => core.getInput(name),
      env: process.env,
    });

    // Das Token steht ab hier in Fehlermeldungen und Stacktraces mit drin,
    // falls Octokit es je mitliefert. `setSecret` sorgt dafuer, dass das Log
    // es maskiert, auch wenn es ueber einen Umweg dorthin gelangt.
    core.setSecret(inputs.githubToken);

    await runAction({
      octokit: getOctokit(inputs.githubToken),
      inputs,
      io,
    });
  } catch (error) {
    core.setFailed(describeFailure(error));
  }
}

void main();
