# @rozenite/ui and lucide-react 0.263.1 under React 19

`node repro.mjs` (Node 18 or later, npm on PATH) resolves `package.json` with `npm install --package-lock-only` in a temporary folder and reads `packages/ui` and `packages/shell` at the head of rozenite's main. Exit 1: npm reports the React peer conflict from lucide-react; 0: it does not, or main changed the range; 2: a step failed.
