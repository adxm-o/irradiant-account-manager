# Irradiant Account Manager

Roblox account manager, split out of the main Irradiant app into its own program. Same gold/black theme,
same vault, same multi instance switch, no editor or script hub.

## What it does

- stores accounts from a `.ROBLOSECURITY` cookie, AES-256-GCM, on this machine only
- pulls the username, user id and avatar off Roblox so you can see whose cookie it is
- launches Roblox already signed in, straight into a place id if you set one
- multi instance switch, holds `ROBLOX_singletonEvent` so more than one client can run
- tray icon with a quick switch panel for swapping accounts without opening the window
- X minimises to tray by default, can be turned off in settings

The only thing that leaves the machine is a request to Roblox itself, over https, to look up the profile
or get a launch ticket.

## Tray and quick switch

Left click the tray icon and a small panel opens near the cursor with every stored account. Click one to
launch it. Enter launches the top match after you type, esc closes it. Multi instance toggle is in the
footer of the panel.

Right click gives the same list as a menu, plus the multi instance checkbox, open and quit.

Settings has the rest: X minimises or quits, tray click opens the panel or the window, panel stays on top
or not, vault protection mode, delete vault.

## Vault location

Separate program, separate data dir, so it gets its own vault. It lands in AppData\Roaming:

```
C:\Users\<you>\AppData\Roaming\Irradiant Account Manager\accounts.vault
```

The main Irradiant app keeps its own next door in `Roaming\Irradiant\accounts.vault`. They are not shared.
Either add the accounts again here or copy the file over if both are on the same protection mode.

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm start
```

`npm run package` puts a Windows installer in `release/`.

## Tests

```bash
npm test
```

Vault (encryption, redaction, lock/unlock, rekey), the launch uri builder, and the multi instance holder.
They run under Electron because they need safeStorage and real windows kernel objects. The multi test
skips itself if a Roblox client is open, since turning multi instance on closes running clients.

## Layout

```
electron/    main process: vault, roblox lookup, launch, multi instance, windows
shared/      types + cookie parsing, used by both sides
src/         renderer: titlebar, accounts, settings, quick switch
```
