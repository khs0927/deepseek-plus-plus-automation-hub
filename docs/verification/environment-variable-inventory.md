# Environment variable inventory

This is a names-only inventory. It intentionally contains no environment values.
Use `.env.example` for safe placeholders and keep real `.env` files local.

## Project-controlled variables

- Native host and shell: `DPP_LOG_FILE`, `DPP_OFFICECLI_INSTALL_DIR`, `DPP_FOLDER_PICK_TITLE`, `DPP_FOLDER_PICK_DEFAULT_PATH`, `OFFICECLI_SKIP_UPDATE`.
- DeepSeek++ build/test: `DEEPSEEK_PP_UPDATE_PROMPT_GOLDENS`, `CI`, and WXT's build-time `FIREFOX` flag.
- Seumter/CDP: `SEUMTER_MCP_PORT`, `CDP_URL`, `EDGE_CDP_URL`, `EDGE_PORT`, `EDGE_USER_DATA_DIR`, `EDGE_PATH`, `EDGE_URL`, `SEUMTER_PROJECT_CONFIG`, `SEUMTER_TARGET_DIR`, `SEUMTER_DESKTOP_DIR`.
- Optional MCP provider credentials: `DOPPLER_TOKEN`, `EXA_API_KEY`, `KAGGLE_USERNAME`, `KAGGLE_KEY`, `VWORLD_API_KEY`, `BLDRGST_SERVICE_KEY`, `ARCHPMS_SERVICE_KEY`, `HSPMS_SERVICE_KEY`, and `LAW_OC`.
- Optional local integrations: `FREECAD_PATH`, `RHINO_HOST`, `RHINO_PORT`, `RHINO_FULL_CONFIG`, `RHINO_MCP_HOST`, `RHINO_MCP_LOG_LEVEL`, `RHINO_MCP_TRANSPORT`, `RHINO_MCP_TRANSPORT_KIND`, `FASTMCP_LOG_LEVEL`, `FASTMCP_SHOW_SERVER_BANNER`, and `LOG_LEVEL`.
- GitHub CLI aliases: `GH_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_PERSONAL_ACCESS_TOKEN`. Prefer the OS keyring via `gh auth login` instead of storing these.

## Inherited host variables

The native host reads selected host variables such as `PATH`/`Path`, `SHELL`, `LOCALAPPDATA`, `ProgramFiles`, and `ProgramFiles(x86)`. Their values are machine-specific and are never exported to this repository.

## Security rule

No API key, OAuth token, cookie, password, private key, or real path containing credentials is included. The repository ignores `.env.*` files except example templates, private key extensions, and `secrets/` directories. If a real credential was ever committed, rotate it and remove it from Git history; making the repository private is not a substitute for rotation.
