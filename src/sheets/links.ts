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
    id: "2014-all",
    label: "All the classic 2014 sheets",
    note: "The whole official set: fillable and print versions, the alternative layouts, the spellcasting and details pages.",
    url: "https://media.dndbeyond.com/compendium-images/marketing/5e_charactersheets.zip",
    file: "5e_charactersheets.zip",
  },
  {
    id: "2024-print",
    label: "Official 2024 sheet",
    note: "2 pages. This copy has no form fields, so the text is written onto the page. A fillable copy of the same sheet works too if you load it.",
    url: "https://media.dndbeyond.com/compendium-images/phb/downloads/DnD_2024_Character-Sheet.pdf",
    file: "DnD_2024_Character-Sheet.pdf",
  },
];
