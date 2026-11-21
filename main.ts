// Driver for the csv-reader-speed entry (Node 22, standard library only).
// The harness runs `node /bot/main.ts`. It reads the cases from
// /input/cases.json, answers each one alone with run() from solve.js, and
// writes the answers, one per case in order, to /output/answers.json.
// Outside a container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in
// for /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Turn V8's incremental marking off before solve.js is imported, so all of
// the parsing runs under it (the baseline runs the same way).
setFlagsFromString('--no-incremental-marking');

const { run } = await import(new URL('./solve.js', import.meta.url).href);

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const answers = [];
for (const { input } of cases) answers.push(run(input));
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
