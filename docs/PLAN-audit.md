# Plán: úplný audit tvorby postáv (2026-10-17)

Cieľ: mať istotu, že každá možnosť v Soul Forge funguje podľa pravidiel. Ide o každú triedu, podtriedu, druh,
pôvod, výkon (feat), voľbu, kúzlo, sprievodcu, nastavenie a filter, z Aurory aj z 5e.tools. Ďalej treba overiť,
ako sa každá možnosť zapisuje do postavy a ako sa dostane na každý hárok. Dôvod: včerajšie postavy (Henka,
Indigo, Xelinora, Elisabeth) mali veľa chýb a testy ich nezachytili.

Platí pravidlo [[soulforge-universal-fixes]]: každá chyba sa opraví pre všetky postavy a dostane test, ktorý ju
zachytí, keby sa vrátila.

Stav dnes, pre porovnanie:
- **Aurora:** asi 14 000 prvkov, 38 typov. Napríklad 1 924 schopností podtried, 1 016 schopností tried,
  1 000 rasových čŕt, 1 080 kúziel, 321 výkonov, 272 podtried, 139 druhov a 81 poddruhov, 118 pôvodov a
  164 sprievodcov.
- **5e.tools:** asi 8 700 prvkov po prevode, a bez bestiára.
- **Testy dnes:** náhodné dávky, úroveň 20 v každej triede, pokrytie podtried, druhov, pôvodov a výkonov, a
  nikdy nevybrané možnosti (okrem kúziel).
- **Čo testy nevidia:**
  - pripravené kúzlá;
  - filtre z rozhrania (2024, legacy);
  - zmiešaný obsah;
  - cesty cez rozhranie;
  - väčšinu úrovní medzi 1 a 20;
  - väčšinu kombinácií multiclass;
  - sprievodcov do hĺbky;
  - väčšinu polí na hárkoch.

## Fáza A: Atlas softvéru (čo všetko existuje a ako to spolu súvisí)

Automaticky vygenerovaný atlas, nie ručný zoznam. Uloží sa ako `docs/atlas/` (Markdown na čítanie) a
`atlas.json` (pre testy).

1. **Každý prvok obsahu**, z Aurory aj z 5e.tools:
   - typ, kniha a pravidlá (2014 alebo 2024);
   - čo dáva (grant), čo ponúka na výber (select) a čo mení v číslach (stat);
   - aké má požiadavky;
   - odkiaľ sa naň dá dostať (ktorá trieda, druh alebo výkon ho ponúka a na akej úrovni).

   Prvky, na ktoré sa nedá dostať, a odkazy na neexistujúce prvky idú do zoznamu chýb.
2. **Každý typ pravidla v engine**, teda každé meno štatistiky (`ac`, `hp`, `speed:climb`,
   `strength:save:proficiency`...):
   - kto ho číta (sheet.ts, rulesCheck.ts, hárky);
   - kto ho zapisuje.

   Štatistika, ktorú obsah nastavuje, ale nikto ju nečíta, je chyba: obsah niečo robí a appka to ignoruje.
3. **Každá voľba v rozhraní**, teda každý ovládací prvok na Build, Play, Manage a v nastaveniach:
   - čo zapíše do JSON postavy (pole, kľúč, formát);
   - čo z toho engine prečíta.

   Výsledkom je schéma súboru postavy, kde ku každému poľu patrí to, čo ho zapisuje a čo ho číta.
4. **Každé nastavenie a filter:**
   - ktoré zoznamy a voľby skrýva alebo mení;
   - či môže znemožniť povinnú voľbu. Tak vznikla včerajšia chyba s filtrom 2024.

Väčšinu spraví skript. Zvyšok je čítanie kódu, cesta po ceste: engine.resolve, requirements, stats, autofill,
startingEquipment, sheet, data, každý hárok a rozhranie Build.

## Fáza B: Pravidlá ako zdroj pravdy

Rules check (`rulesCheck.ts`) sa rozšíri, aby kontroloval všetko, čo pravidlá určujú. Číta pritom aj čísla z
referencie 5e.tools, nie len mená.

- **Vlastnosti:**
  - point buy podľa vlastných pravidiel postavy (napríklad 30 bodov);
  - zvýšenie z pôvodu presne raz (druh alebo pôvod, nie obe);
  - zvýšenia z výkonov;
  - strop 20.
- **Životy a obranné číslo:**
  - životy so všetkými zdrojmi;
  - OČ podľa zbroje a každého vzorca bez zbroje: Bladesong, Barbarian, Monk, Draconic, Lizardfolk, Tortle,
    Warforged...
- **Záchrany, zručnosti, odbornosť, jazyky a nástroje:**
  - záchrany;
  - počet zručností podľa zdrojov, bez opakovaní;
  - odbornosť (expertise);
  - jazyky (2024: obecná reč a dva ďalšie);
  - nástroje.
- **Kúzla:**
  - počet trikov a pripravených kúziel podľa tabuľky triedy;
  - kúzla zo zoznamu triedy, na dosiahnuteľnej úrovni;
  - vždy pripravené kúzla sa nezapočítavajú;
  - **pripravené kúzla musia byť na hárku**;
  - miesta na kúzla aj pri multiclass a Pact Magic.
- **Útoky:** útočný bonus, zranenie, bojový štýl, ovládnutie zbraní (len zvládnuté zbrane), vlastnosti zbraní
  vrátane úprav z výkonov (Crossbow Expert).
- **Schopnosti po úrovniach:**
  - každá schopnosť triedy a podtriedy na každej úrovni;
  - čísla: počet použití, kocky (Sneak Attack, Channel Divinity, Divine Spark...).
- **Výkony:** požiadavky a účinky.
- **Druh:** veľkosť (aj voľba), rýchlosť, videnie v tme, odolnosti, kúzla druhu.
- **Výbava:** štartovná výbava a zlato, nič dvakrát, kúpená výbava zaplatená, ťažká zbroj (Sila, nevýhoda na
  Nenápadnosť).
- **Sprievodcovia a divoké tvary:** štatistiky podľa pravidiel, ktoré ich dávajú.

Každá chyba z Henky, Indiga, Xelinory a Elisabeth sa stane regresným testom.

## Fáza C: Doslova každá možnosť, postavená a skontrolovaná

Výpočet pokrytia namiesto náhody:
- Začne sa od každej triedy, každého druhu a každého pôvodu.
- Engine sa spýta na každú otvorenú voľbu a každá jej možnosť sa vyskúša. Vznikne strom volieb, ktorý sa
  prejde do šírky.
- Cieľ je **100 % dvojíc (voľba, možnosť)**, ktoré pravidlá dovoľujú, vrátane kúziel a vnorených volieb. Príklady:
  - bojové štýly, invokácie, manévre a metamágia;
  - infúzie, pakty, obľúbení nepriatelia, krajiny a totemy;
  - zbrane a strelné zbrane (firearms);
  - Bladesinger a jeho Bladesong;
  - Tasha's voliteľné schopnosti a Customized Origin;
  - dračie znamenia (dragonmarks);
  - Elemental Adept a ďalšie výkony s voľbou.
- Každá nedosiahnutá možnosť dostane dôvod (nemožná požiadavka, chyba obsahu, chyba engine) a prejde sa ručne.

Postavy, ktoré sa postavia:
1. **Každá trieda a podtrieda na každej úrovni**, kde pribúda schopnosť alebo voľba, nie len na úrovni 20.
2. **Každý druh, poddruh a rodová línia** pri pravidlách 2014 aj 2024. Každý pôvod a jeho varianty.
3. **Každý výkon a jeho podvoľby** na najnižšej úrovni, kde je dovolený.
4. **Multiclass:** každá dvojica tried (13 × 12) na niekoľkých úrovniach, s požiadavkami, miestami na kúzla a
   Pact Magic.
5. **Voliteľné pravidlá a nastavenia:**
   - Tasha's, strelné zbrane, multiclass zámok;
   - filtre legacy, 2024, playtest a ostatné svety;
   - „každé kúzlo na hárku“.

   Každá kombinácia filtrov sa prejde **cez tú istú filtrovaciu funkciu ako rozhranie**, takže filter nesmie
   znemožniť žiadnu povinnú voľbu.
6. **Sprievodcovia:** každý zdroj sprievodcu (Beast Master 2014 aj 2024, Find Familiar, Wild Companion, Steel
   Defender, Homunculus, Drakewarden, jazdecké zvieratá) a každý prvok sprievodcu.
7. **Tri zmesi obsahu:** len Aurora, len 5e.tools, obe naraz. Pri zmesi sa kontroluje, že sa nič nezdvojí
   (kúzla, vybavenie, zvýšenia) a že sa nič neprepíše.
8. **Postavy hráča:** cez self-test reálnej appky s presne tým obsahom, ktorý si nahral.

Ku každej postave:
- rules check;
- každý hárok;
- uloženie a načítanie JSON;
- porovnanie „čo zvolilo rozhranie“ s tým, „čo je na hárku“.

Počty idú do tisícok postáv. Beží to paralelne a s cache, ako nočný beh (nie pri každom vydaní) a pred veľkým
vydaním. Výsledok je report s pokrytím (napríklad „1 924 schopností podtried: 100 % postavených, 0 chýb“).

## Fáza D: Ručná hĺbková kontrola, trieda po triede

Automatika nájde nesúlad, ale nie všetko. Každá trieda (13 a ich verzie 2014 a 2024) a každá podtrieda prejde
úroveň po úrovni proti referencii:
- čo dostane;
- čísla;
- voľby;
- čo z toho ukazuje appka a hárok.

Tie isté body ako pri Henke a Indigu, len systematicky. Výstup je jeden report na triedu v `docs/audit/`, s
opravami a testami. Takto sa prejdú aj ťažké prípady:
- Bladesong, Wild Shape a Moon;
- Echo Knight, Battle Smith a Steel Defender;
- Hexblade a Pact of the Blade;
- strelné zbrane, Monk bez zbroje, Jack of All Trades;
- rozšírené zoznamy kúziel (expanded lists).

## Fáza E: Cesty cez rozhranie

Pre každú cestu tvorby test v reálnom rozhraní (Playwright), ktorý porovná zapísaný JSON s očakávaním:
- výber na karte, úprava a späť;
- postup na úroveň a multiclass;
- príprava kúziel;
- výbava a nákup;
- import a export;
- každé nastavenie.

Takto sa chytí aj chyba, keď rozhranie zapíše niečo iné, než engine čaká.

## Fáza F: Každý hárok

Hárky v appke dnes:
- oficiálny 2024 (WotC);
- oficiálne 2014 (balík: 3 strany a ďalšie);
- DLDM 5E24 (5 strán);
- sprievodcovské hárky DLDM (Familiar, Paladin Mount, Beastmaster, Drakewarden);
- vlastný PDF Soul Forge;
- „akýkoľvek vyplniteľný PDF“;
- rozloženia `layouts/*.json` (2024, 3p, adventurers, alt, alt2, classic, details, spells);
- nový detský hárok.

1. **Profil každého hárku**, uložený v appke (`src/sheets/profiles/`):
   - každé pole, jeho význam, formát a strana;
   - čo sa stane, keď sa niečo nezmestí;
   - zvláštnosti (napríklad pri DLDM sú hodnoty nad popiskami a názvy polí kúziel sú prehodené).

   Appka podľa profilu vypĺňa a testy podľa neho kontrolujú.
2. **Test pre každé pole:** plne nabitá testovacia postava vyplní každý hárok a každé pole sa porovná s
   očakávaním. Prázdne pole, ktoré malo byť plné, je chyba.
3. **Tlačené hárky bez polí** dostanú polia tak ako detský hárok:
   - polia na mieru;
   - priehľadné;
   - zaškrtávacie políčka len s fajkou;
   - písmo s diakritikou;
   - preklad popiskov tam, kde je treba.
4. **Licencie:**
   - Hárky WotC aj DLDM sa dnes sťahujú z ich stránok, nie sú súčasťou appky.
   - Pribalia sa iba tam, kde to licencia výslovne dovoľuje. Inak zostane sťahovanie v appke (jedno tlačidlo) a
     profil, ktorý z neho spraví vyplniteľný hárok.
   - Vlastné hárky Soul Forge a detský hárok sa pribalia, ak je kresba voľne použiteľná.

## Fáza G: Divoké tvary ako kúzla

1. **V postave:**
   - zoznam známych tvarov s pravidlami podľa úrovne druida: počet, maximálne ND, bez letu do 8. úrovne,
     Kruh mesiaca;
   - výber v Magic, rovnako ako príprava kúziel;
   - kontrola v rules check.
2. **Zvieratá:**
   - z Aurory (typ Companion) aj z 5e.tools; import 5e.tools dostane aj bestiár;
   - preklad kariet podľa jazyka appky.
3. **Karty divokých tvarov** ako karty kúziel, so štatistikami už upravenými pre postavu:
   - OČ aspoň 13 + Múdrosť pri Kruhu mesiaca;
   - dočasné životy;
   - vlastná Inteligencia, Múdrosť a Charizma;
   - záchrany a zručnosti s vlastnou zdatnosťou;
   - +Múdrosť k záchranám na Odolnosť pri Vylepšených kruhových formách;
   - žiarivé útoky.

   Rovnako sa budú dať použiť pre Polymorph a sprievodcov.
4. **Divoký tvar v Play:** premena, dočasné životy a koniec premeny.

## Fáza H: Opravy

- Chyby sa zbierajú v jednom zozname podľa vplyvu: najprv tie, ktoré dávajú zlé čísla alebo nedovolia povinnú
  voľbu, potom chýbajúce údaje, potom vzhľad.
- Každá oprava dostane test a beh relevantnej časti auditu.
- Do zoznamu idú aj otvorené chyby z `docs/PLAN-windows.md` (sekcie 9, 11, 12) a z dnešných postáv:
  - filter 2024;
  - dvojité zvýšenia vlastností;
  - 173 duplicitných id z 5e.tools;
  - druh z 5e.tools bez veľkosti a jazykov (opravené 2026-10-17);
  - náhodné postavy, ktoré nepripravujú kúzla.

## Poradie a odhad

1. Fáza A (atlas) a regresné testy z dnešných postáv: 2–3 dni. Bez atlasu nevieme, čo je „všetko“.
2. Fáza B (rozšírený rules check): 3–4 dni.
3. Fáza C (generovanie všetkého) a opravy, ktoré ukáže: týždeň a viac. Počet chýb dnes nevieme odhadnúť.
4. Fáza D (ručne trieda po triede): 1–2 dni na triedu, dá sa robiť popri C.
5. Fáza F (hárky a profily): 3–5 dní.
6. Fáza G (divoké tvary): 2–3 dni.
7. Fáza E (cesty cez rozhranie): 2–3 dni.

Vydania sa robia priebežne po opravách, nie až na konci.

## Rozhodnutia (2026-10-17)

1. **Hárky WotC a DLDM:** zostávajú na stiahnutie, nebalia sa. Ku každému sa však do appky uloží profil
   (fáza F), aby appka presne vedela, čo kam patrí.
2. **Detský hárok je z Etsy.** Tlačoviny z Etsy majú zvyčajne licenciu len na osobné použitie, takže ho appka
   nebalí. Jeho vyplniteľná verzia zostáva na osobné použitie hráča. Ak by sa mal dať do appky, treba:
   - zistiť licenciu z konkrétnej ponuky;
   - pridať odkaz na autora;
   - ideálne mať súhlas autora.
3. **Rozsah obsahu:**
   - oficiálny obsah na 100 % vo všetkom;
   - všetko v súboroch Aurora na 100 % okrem Unearthed Arcana;
   - tretie strany: analýza a testy, teraz nie nutne na 100 %, ale cieľom je 100 % (okrem homebrew).
4. **Karty** sa robia pre divoké tvary, Polymorph aj sprievodcov.
