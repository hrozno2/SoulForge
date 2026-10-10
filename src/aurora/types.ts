/**
 * Element model for the Aurora element format (XML files with <element> nodes).
 * Written from the public format documentation at aurorabuilder.com/documentation.
 */

export interface SetterValue {
  value: string;
  /** Extra attributes such as `type` for damage, `currency` for cost or `lb` for weight. */
  attrs: Record<string, string>;
}

export interface SheetDescription {
  level?: number;
  /** Sheet text, may contain {{stat}} placeholders. */
  text: string;
  action?: string;
  usage?: string;
}

export interface SheetInfo {
  display: boolean;
  alt?: string;
  action?: string;
  usage?: string;
  descriptions: SheetDescription[];
}

export interface GrantRule {
  kind: "grant";
  type: string;
  id: string;
  level?: number;
  requirements?: string;
  spellcasting?: string;
  prepared?: boolean;
  allowReplace?: boolean;
  name?: string;
}

export interface SelectRule {
  kind: "select";
  type: string;
  name: string;
  supports: string;
  level?: number;
  requirements?: string;
  number: number;
  default?: string;
  optional?: boolean;
  spellcasting?: string;
  allowReplace?: boolean;
  /** For type "List": plain text choices (personality traits, ideals and similar). */
  items?: { id: string; text: string }[];
}

export interface StatRule {
  kind: "stat";
  name: string;
  /** A number or the name of another statistic. */
  value: string;
  bonus?: string;
  equipped?: string;
  level?: number;
  requirements?: string;
  inline?: boolean;
  alt?: string;
}

export type ARule = GrantRule | SelectRule | StatRule;

export interface SpellcastingInfo {
  name: string;
  ability?: string;
  prepare?: boolean;
  extend?: boolean;
  list: string[];
  extendLists: string[];
}

export interface MulticlassInfo {
  id: string;
  prerequisite?: string;
  requirements?: string;
  setters: Record<string, SetterValue>;
  rules: ARule[];
}

export interface AElement {
  id: string;
  name: string;
  type: string;
  source: string;
  supports: string[];
  requirements?: string;
  /** Builder side-panel HTML. */
  description: string;
  compendiumHidden: boolean;
  sheet?: SheetInfo;
  setters: Record<string, SetterValue>;
  rules: ARule[];
  spellcasting?: SpellcastingInfo;
  multiclass?: MulticlassInfo;
  /** Item contents unpacked by the "extract" action (equipment packs). */
  extract?: { id: string; amount: number }[];
  /** Where it came from, so a source can be removed or updated. */
  origin?: string;
}

/** `<append id="...">` adds rules to an element defined elsewhere. */
export interface AAppend {
  id: string;
  rules: ARule[];
  supports: string[];
}

export interface ParsedFile {
  elements: AElement[];
  appends: AAppend[];
  /** From the <info><update version="..."> header. */
  version?: string;
  name?: string;
}

export interface IndexFileRef {
  name: string;
  url: string;
}

export interface ParsedIndex {
  name: string;
  description: string;
  version: string;
  files: IndexFileRef[];
}
