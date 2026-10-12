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
 * Sheets Soul Forge fills completely, with where to get them. None are bundled: the desktop app downloads them from their
 * makers' own addresses when asked, and the copy stays on this computer. Each address is on its own line for the link check.
 */
export interface SheetDownload {
  id: string;
  label: string;
  /** Who made it, for the credit next to the button. */
  by: string;
  note: string;
  /** One or more files. A .zip is opened and every PDF in it is added. */
  files: { url: string; file: string }[];
}



export const OFFICIAL_DOWNLOADS: SheetDownload[] = [
  {
    id: "2024-dldm",
    label: "2024 sheet, fillable (DLDM, 5 pages)",
    by: "DLtheDM",
    note: "A fillable 2024 sheet: two page 1 styles, two page 2 styles and a spell list page. Fields stay editable.",
    files: [{
      url: "https://drive.usercontent.google.com/download?id=120ePGYWD6NmExoEefO1wSOQA_gMhqaqy&export=download",
      file: "DLDM - 5E24 CHARACTER SHEET - 5pg - Updated Form Fields.pdf",
    }],
  },
  {
    id: "2024-print",
    label: "Official 2024 sheet (print)",
    by: "Wizards of the Coast",
    note: "2 pages. This copy has no form fields, so the text is written onto the page. A fillable copy of the same sheet works too if you load it.",
    files: [{
      url: "https://media.dndbeyond.com/compendium-images/phb/downloads/DnD_2024_Character-Sheet.pdf",
      file: "DnD_2024_Character-Sheet.pdf",
    }],
  },
  {
    id: "2014-all",
    label: "All the classic 2014 sheets",
    by: "Wizards of the Coast",
    note: "The whole official set: fillable and print versions, the alternative layouts, the spellcasting and details pages.",
    files: [{
      url: "https://media.dndbeyond.com/compendium-images/marketing/5e_charactersheets.zip",
      file: "5e_charactersheets.zip",
    }],
  },
  {
    id: "dldm-companions",
    label: "Companion sheets (DLDM)",
    by: "DLtheDM",
    note: "Familiar, Paladin Mount, Beastmaster Ranger and Drakewarden Ranger companion sheets.",
    files: [
      { url: "https://drive.usercontent.google.com/download?id=1Ixz6HQA-xGRIIAQS_eKca76AtMZubU86&export=download", file: "DLDM - 5E14 - Companion Sheet - Familiar.pdf" },
      { url: "https://drive.usercontent.google.com/download?id=1lE48RMvEqq8wqyeIaV542W0sxKWE0Dvg&export=download", file: "DLDM - 5E14 - Companion Sheet - Paladin Mount.pdf" },
      { url: "https://drive.usercontent.google.com/download?id=1TxcJiL_6En9Bvho8Jfx6-2Yqz6p9n9WQ&export=download", file: "DLDM - 5E14 - Companion Sheet - Beastmaster Ranger.pdf" },
      { url: "https://drive.usercontent.google.com/download?id=14A6ZhYwGuerxuI84l3Gs-aaowaRdE26O&export=download", file: "DLDM - 5E14 - Companion Sheet - Drakewarden Ranger.pdf" },
    ],
  },
];

