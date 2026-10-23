import fc from 'fast-check'

// A mutant must be killed (or survive) the same way on every run, so property
// tests use a fixed seed under Stryker instead of a fresh one per run.
fc.configureGlobal({ seed: 20261017, numRuns: 100 })
