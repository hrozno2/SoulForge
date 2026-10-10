/**
 * Interface language for the app shell: tabs, the Home screen, the main Play buttons and Settings headings.
 * Rules content is translated separately (see Translate in the sheet export). Anything without a translation falls back to English.
 */
export type Lang = "en" | "de" | "es" | "fr" | "pt";

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
];

type Dict = Record<string, string>;

const DICT: Record<Exclude<Lang, "en">, Dict> = {
  de: {
    Home: "Start", Build: "Aufbau", Magic: "Magie", Equipment: "Ausrüstung", Manage: "Verwalten", Play: "Spielen", Sheet: "Bogen", Content: "Inhalte",
    Characters: "Charaktere", "New character": "Neuer Charakter", "Random character": "Zufälliger Charakter", Duplicate: "Duplizieren", Export: "Exportieren", Delete: "Löschen",
    Party: "Gruppe", Settings: "Einstellungen", Heal: "Heilen", Damage: "Schaden", Temp: "Temp.", Amount: "Menge", "Short rest": "Kurze Rast", "Long rest": "Lange Rast",
    "Hit Points": "Trefferpunkte", Language: "Sprache", "Interface size": "Oberflächengröße", Reset: "Zurücksetzen", "Level up": "Stufenaufstieg", Close: "Schließen",
  },
  es: {
    Home: "Inicio", Build: "Crear", Magic: "Magia", Equipment: "Equipo", Manage: "Gestionar", Play: "Jugar", Sheet: "Hoja", Content: "Contenido",
    Characters: "Personajes", "New character": "Nuevo personaje", "Random character": "Personaje aleatorio", Duplicate: "Duplicar", Export: "Exportar", Delete: "Eliminar",
    Party: "Grupo", Settings: "Ajustes", Heal: "Curar", Damage: "Daño", Temp: "Temp.", Amount: "Cantidad", "Short rest": "Descanso corto", "Long rest": "Descanso largo",
    "Hit Points": "Puntos de golpe", Language: "Idioma", "Interface size": "Tamaño de la interfaz", Reset: "Restablecer", "Level up": "Subir de nivel", Close: "Cerrar",
  },
  fr: {
    Home: "Accueil", Build: "Création", Magic: "Magie", Equipment: "Équipement", Manage: "Gérer", Play: "Jouer", Sheet: "Fiche", Content: "Contenu",
    Characters: "Personnages", "New character": "Nouveau personnage", "Random character": "Personnage aléatoire", Duplicate: "Dupliquer", Export: "Exporter", Delete: "Supprimer",
    Party: "Groupe", Settings: "Réglages", Heal: "Soigner", Damage: "Dégâts", Temp: "Temp.", Amount: "Montant", "Short rest": "Repos court", "Long rest": "Repos long",
    "Hit Points": "Points de vie", Language: "Langue", "Interface size": "Taille de l'interface", Reset: "Réinitialiser", "Level up": "Monter de niveau", Close: "Fermer",
  },
  pt: {
    Home: "Início", Build: "Criar", Magic: "Magia", Equipment: "Equipamento", Manage: "Gerir", Play: "Jogar", Sheet: "Ficha", Content: "Conteúdo",
    Characters: "Personagens", "New character": "Novo personagem", "Random character": "Personagem aleatório", Duplicate: "Duplicar", Export: "Exportar", Delete: "Excluir",
    Party: "Grupo", Settings: "Configurações", Heal: "Curar", Damage: "Dano", Temp: "Temp.", Amount: "Quantidade", "Short rest": "Descanso curto", "Long rest": "Descanso longo",
    "Hit Points": "Pontos de vida", Language: "Idioma", "Interface size": "Tamanho da interface", Reset: "Redefinir", "Level up": "Subir de nível", Close: "Fechar",
  },
};

let lang: Lang = "en";

export function setLanguage(l: Lang): void {
  lang = l in DICT || l === "en" ? l : "en";
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

/** The text in the current interface language, or the English text itself. */
export function t(text: string): string {
  return lang === "en" ? text : DICT[lang][text] ?? text;
}
