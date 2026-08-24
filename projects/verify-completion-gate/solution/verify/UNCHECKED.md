# What verify/gate.sh does not check

- Whether the export belongs in a larger product (API route, UI button, streaming). This toy only covers the file writer.
- Encoding beyond UTF-8 text, Excel "sep=" quirks, or locale-specific delimiters.
- Performance, accessibility, or security.
- Conditions you add later without extending `drive-conditions.mjs`.
- Fit and style of any fix the agent writes — read the diff.
