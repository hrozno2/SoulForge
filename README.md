# CharForge

Desktop D&D 5e (2024 rules) character builder with a data-driven rules engine.
Runs on Windows, macOS and Linux through Tauri. Original code, not affiliated with Aurora Builder or Wizards of the Coast.

## Install

| Platform | How |
| --- | --- |
| macOS | `brew install --cask hrozno2/charforge/charforge` |
| Arch, CachyOS, Manjaro | Add the pacman repo once (below), then `sudo pacman -S charforge-bin` |
| Windows | Download the `.exe` or `.msi` from the [latest release](https://github.com/hrozno2/charforge/releases/latest) |
| Other Linux | The AppImage (updates itself), or the `.deb` / `.rpm` from the latest release |

### Arch, CachyOS, Manjaro (pacman repository, no AUR)

Each release publishes a small pacman repository. Add it once to `/etc/pacman.conf`:

    [charforge]
    SigLevel = Optional TrustAll
    Server = https://github.com/hrozno2/charforge/releases/download/arch

Then:

    sudo pacman -Syu charforge-bin

After that, `sudo pacman -Syu` updates CharForge together with the rest of the system. Packages are not GPG signed,
so the repo is trusted only over HTTPS from your GitHub account. x86_64 only. To build it yourself instead, copy
`packaging/arch/PKGBUILD` and run `makepkg -si`.

Builds are not code signed yet, so Windows SmartScreen and macOS Gatekeeper may warn on first launch.
The Homebrew cask clears the macOS quarantine flag for you.

## Updates

The app checks for a new version shortly after launch (and from the "Check for updates" button).

| Install type | What happens |
| --- | --- |
| Windows installer, macOS app, Linux AppImage | "Install and restart" downloads the signed update and relaunches |
| Arch, CachyOS (pacman repo) | The app tells you a new version exists. Update with `sudo pacman -Syu` |
| `.deb` / `.rpm` | The app tells you a new version exists and opens the releases page |
| Homebrew cask | The app updates itself. The cask is marked `auto_updates` so `brew upgrade` leaves it alone |

Updates are verified against a public key built into the app, so only releases signed with your key install.

## Publishing (maintainer)

One-time setup, on your own machine with `git`, `node`, `npm` and the GitHub CLI (`gh auth login`):

    scripts/publish.sh            # creates the repo and the Homebrew tap, makes the signing key, sets secrets, pushes

Then cut releases:

    scripts/release.sh 0.2.0      # bumps versions, tags, pushes. CI builds every platform and publishes

CI builds Windows, macOS (Apple silicon and Intel) and Linux (x86_64 and arm64), publishes the release with the
update manifest (`latest.json`), then refreshes the Homebrew cask and the pacman repository (the rolling `arch` release).

### Secrets

| Secret | Set by | Purpose |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` and `..._PASSWORD` | `scripts/publish.sh` | Signs update files |
| `HOMEBREW_TAP_TOKEN` | you | Fine-grained token with Contents read and write on `homebrew-charforge`. Without it the cask is not refreshed |

Back up `~/.charforge-signing`. If the key is lost, installed copies can never update again and people must reinstall.

### Before the first release

- Test updating: release `0.2.0`, install it, release `0.2.1`, and launch the old copy.
- CachyOS itself only ships packages its maintainers add. Users get CharForge from the pacman repository above.

## Develop

    npm install
    npm run dev            # browser at http://localhost:1420
    npm run tauri dev      # desktop app (needs Rust and the Tauri prerequisites)
    npm run tauri build    # installers for the OS you build on
    npm test

Tauri prerequisites: https://v2.tauri.app/start/prerequisites/

## Content

- Ships with a small starter sample only.
- Content tab: open aurorabuilder.com or the AuroraLegacy elements repo, download the ZIP, import it. Pick the book folders you want (the 2024 Player's Handbook is preselected).
- Custom modifiers: build them in the Content tab or load a JSON pack.

## PDF export and character import

- Sheet tab, Export PDF: choose the 2024-style sheet, spell cards, item cards and feat/feature cards, on A4 or Letter. Cards are 2.5 x 3.5 in, nine per page.
- Content tab, Import a character: Foundry VTT (dnd5e actor JSON), Roll20 (D&D 5e OGL sheet attributes as JSON) or a CharForge export.
  Names are matched against loaded content. Anything not found is kept as a plain entry so the printed sheet and cards stay complete.
- The Foundry and Roll20 readers were written from the documented sheet structure, not from real exports. If a file imports badly, keep it and adjust `src/engine/importers.ts`.

## Modifier format

Every element changes a character only through rules:

    { "kind": "stat", "stat": "ac", "op": "add", "value": 2 }
    { "kind": "stat", "stat": "hp", "value": "level * 2" }
    { "kind": "proficiency", "target": "skill:stealth", "level": "expertise" }
    { "kind": "grant", "ids": ["other-element-id"], "minLevel": 5 }
    { "kind": "choose", "id": "x", "label": "Pick skills", "as": "skill", "count": 2, "options": ["arcana", "history"] }
    { "kind": "asi", "options": ["str", "dex", "con"] }
    { "kind": "spellcasting", "ability": "int", "caster": "full" }

Any rule can carry `minLevel`. Stat ops apply in the order set, max, min, add. Formula variables: level, prof, str..cha, strMod..chaMod.
Functions: floor, ceil, round, min, max, abs.

`caster` is `full`, `half`, `third` or `pact` and picks the slot table. The sheet shows spell save DC, spell attack and slots.
Tune them with the custom stats `spell.dc` and `spell.attack`.

## Known gaps

- Aurora level-dependent text (for example Second Wind at higher levels) uses the base level text.
- Aurora `select` rules and `requirements` with positive conditions are skipped on import.
- No spells known or prepared tracking, inventory weight or multiclassing yet.

## License

MIT, see `LICENSE`. This covers CharForge's code only. It does not include or grant rights to any Dungeons & Dragons
content; import your own copies from the Content tab.
