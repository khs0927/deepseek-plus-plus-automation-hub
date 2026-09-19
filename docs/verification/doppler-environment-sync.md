# Doppler environment sync

This repository uses Doppler for runtime secrets. GitHub contains the procedure and safe variable-name templates; it never contains real secret values.

## One-time setup

Install the Doppler CLI and authenticate locally:

```powershell
winget install --id Doppler.doppler --exact --source winget
doppler login
```

Select the project and config for this checkout. Replace the placeholders with the values shown in the Doppler dashboard:

```powershell
doppler setup --project <doppler-project> --config <doppler-config>
```

## Upload a local environment file

Keep the populated file outside Git or use the ignored `.env` file in this checkout:

```powershell
doppler secrets upload .env --project <doppler-project> --config <doppler-config>
```

The upload command sends values to Doppler. Do not paste the file contents into chat or commit the file. This repository's `.env.example` contains names and placeholders only.

## Verify without printing values

Use the names-only view to confirm the sync:

```powershell
doppler secrets --project <doppler-project> --config <doppler-config> --only-names
```

For local execution, inject secrets only into the child process:

```powershell
doppler run --project <doppler-project> --config <doppler-config> -- <command>
```

## Scope used by this project

Upload project and integration variables listed in `.env.example` and `docs/verification/environment-variable-inventory.md`. Do not upload host inventory values such as `PATH`, `USERPROFILE`, `LOCALAPPDATA`, browser profile paths, cookies, or native process command lines. Those are machine-specific and are not application secrets/configuration.

If an environment variable is a credential, API key, OAuth token, cookie, password, private key, or service token, store its value only in Doppler and mark it as secret there. Never add a populated `.env` file, Doppler token, or downloaded secrets file to Git.

## Rotation and recovery

If a credential is ever exposed in a commit, rotate it at the provider first, then remove the file from the working tree and clean the Git history. Making the GitHub repository private does not make an exposed credential safe.
