/**
 * Where to get the sheets Soul Forge can fill. We link to them and never bundle them.
 * The weekly link check (scripts/check-links.mjs, run by .github/workflows/link-check.yml) reads this file,
 * so keep every address as a plain string on its own line.
 */
export const SHEET_LINKS: { label: string; url: string }[] = [
  {
    label: "Official 2024 character sheet, print version (Wizards of the Coast)",
    url: "https://media.dndbeyond.com/compendium-images/phb/downloads/DnD_2024_Character-Sheet.pdf",
  },
  {
    label: "DLDM 5E24 sheets and companion sheets, by DLtheDM (shared folder)",
    url: "https://drive.google.com/drive/folders/1Og-Nd_GTqu_JnQBeUMkK-A1tY1IjZ0Wc",
  },
];

/** Shown next to the links, for when one of them has gone away. */
export const SHEET_SEARCH = "https://www.google.com/search?q=DLDM+5E24+character+sheet+form+fillable";

/**
 * The official Wizards of the Coast sheets, which Soul Forge fills completely. They are not bundled: the desktop app downloads
 * them from Wizards' own address when asked, and the copy stays on this computer.
 */
export const OFFICIAL_DOWNLOADS: { id: string; label: string; note: string; url: string; file: string }[] = [
  {
    id: "2014-fillable",
    label: "Classic 2014 sheet, fillable",
    note: "3 pages with spellcasting. Fields are filled and stay editable.",
    url: "https://media.wizards.com/2016/dnd/downloads/5E_CharacterSheet_Fillable.pdf",
    file: "5E_CharacterSheet_Fillable.pdf",
  },
  {
    id: "2024-print",
    label: "Official 2024 sheet, print version",
    note: "2 pages. The text is written onto the page.",
    url: "https://media.dndbeyond.com/compendium-images/phb/downloads/DnD_2024_Character-Sheet.pdf",
    file: "DnD_2024_Character-Sheet.pdf",
  },
];
