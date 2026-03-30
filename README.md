
# Inline-Molang Extension For Bridge
Allows you to reference molang files to be compiled inline.

### Pre-Requisites
- [Dash Compiler](https://github.com/bridge-core/deno-dash-compiler)

### Setup
1. Clone the repo and move the inline-extension folder to `.bridge/extensions/`
2. Apply the extension by modifying your `config.json` file to include `inline-molang` in the plugins list.

### Usage
Anywhere you want to use multi-line molang, reference a molang file such as `molang/test.molang`. *Note that the molang folder must be at the top level of either the bp folder or rp folder, depending on which is referencing the molang file*