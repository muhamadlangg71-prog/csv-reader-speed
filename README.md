# Fast CSV reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/muhamadlangg71-prog/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/muhamadlangg71-prog/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, for [make.fun's csv-reader-speed-01-run-20261121 bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

`solve.js` answers exactly as csv-reader 1.0.0 does for every input — same `{columns, rows, errors}`, including every broken-row error (`stray_cr`, `unterminated_quote`, `quote_junk`, `short_row`, `long_row`) and the exact line numbers — but reads with `indexOf` scans and bulk slices instead of one character at a time, falling back to a character loop only for the rare broken-field cases. On the practice set it is about 3.7x faster than the house baseline.

`main.ts` (Node 22, standard library only) is the program the harness runs: it reads every case from `/input/cases.json`, answers each with `run` from `solve.js`, and writes `/output/answers.json`.

Run it: `mkdir -p out && MAKEFUN_INPUT_DIR=<cases dir> MAKEFUN_OUTPUT_DIR=out node main.ts`

Referral: https://make.fun/r/sz08m7rk
