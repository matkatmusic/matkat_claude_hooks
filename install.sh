#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
npm install
claude plugin marketplace add DietrichGebert/ponytail
claude plugin install ponytail@ponytail
claude plugin install typescript-lsp@claude-plugins-official
