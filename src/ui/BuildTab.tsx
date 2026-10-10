import { useMemo, useState } from "react";
import type { Registry } from "../engine/registry";
import {
  ABILITIES,
  ABILITY_NAMES,
  type Ability,
  type Character,
  type Element,
  type Sheet,
} from "../engine/types";
import { POINT_BUY_BUDGET, POINT_BUY_COST, STANDARD_ARRAY, pointBuySpent } from "../engine/compute";

interface Props {
  character: Character;
  setCharacter: (fn: (c: Character) => Character) => void;
  registry: Registry;
  sheet: Sheet;
}

type Method = "pointbuy" | "array" | "manual";

function ElementSelect(props: {
  label: string;
  value?: string;
  items: Element[];
  onChange: (id: string | undefined) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <select value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value || undefined)}>
        <option value="">Choose...</option>
        {props.items
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((el) => (
            <option key={el.id} value={el.id}>
              {el.name}
            </option>
          ))}
      </select>
    </label>
  );
}

export function BuildTab({ character, setCharacter, registry, sheet }: Props) {
  const [method, setMethod] = useState<Method>("pointbuy");
  const [filter, setFilter] = useState("");
  const patch = (p: Partial<Character>) => setCharacter((c) => ({ ...c, ...p }));

  const setBase = (a: Ability, v: number) =>
    setCharacter((c) => ({ ...c, abilityBase: { ...c.abilityBase, [a]: v } }));

  const spent = pointBuySpent(character.abilityBase);
  const remaining = POINT_BUY_BUDGET - spent;

  const usedArray = ABILITIES.map((a) => character.abilityBase[a]);
  const background = character.background ? registry.get(character.background) : undefined;
  const asiRule = background?.rules?.find((r) => r.kind === "asi");
  const asiOptions = asiRule && asiRule.kind === "asi" ? asiRule.options : [];

  const extraCandidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (q.length < 2) return [];
    return registry
      .all()
      .filter((e) => ["feat", "item", "custom", "subclass", "feature", "spell"].includes(e.type))
      .filter((e) => e.name.toLowerCase().includes(q) && !character.extras.includes(e.id))
      .slice(0, 30);
  }, [filter, registry, character.extras]);

  const togglePick = (id: string, option: string, count: number) =>
    setCharacter((c) => {
      const current = c.choices[id] ?? [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option].slice(-count);
      return { ...c, choices: { ...c.choices, [id]: next } };
    });

  const choiceRules = sheet.elements.flatMap((el) =>
    (el.rules ?? []).flatMap((r) => (r.kind === "choose" ? [{ el, r }] : [])),
  );

  return (
    <div className="grid two">
      <section className="card">
        <h2>Identity</h2>
        <label className="field">
          <span>Name</span>
          <input value={character.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>Level</span>
          <input
            type="number"
            min={1}
            max={20}
            value={character.level}
            onChange={(e) => patch({ level: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
          />
        </label>
        <ElementSelect label="Species" value={character.species} items={registry.ofType("species")} onChange={(species) => patch({ species })} />
        <ElementSelect label="Class" value={character.class} items={registry.ofType("class")} onChange={(cls) => patch({ class: cls })} />
        <ElementSelect
          label="Background"
          value={character.background}
          items={registry.ofType("background")}
          onChange={(bg) => patch({ background: bg, backgroundAsi: undefined })}
        />

        {asiOptions.length > 0 && (
          <div className="subcard">
            <h3>Background ability increase</h3>
            <div className="row">
              <button
                className={character.backgroundAsi?.mode === "1/1/1" ? "pill active" : "pill"}
                onClick={() => patch({ backgroundAsi: { mode: "1/1/1" } })}
              >
                +1 / +1 / +1
              </button>
              <button
                className={character.backgroundAsi?.mode === "2/1" ? "pill active" : "pill"}
                onClick={() =>
                  patch({ backgroundAsi: { mode: "2/1", plus2: asiOptions[0], plus1: asiOptions[1] } })
                }
              >
                +2 / +1
              </button>
            </div>
            {character.backgroundAsi?.mode === "2/1" && (
              <div className="row">
                <label className="field inline">
                  <span>+2</span>
                  <select
                    value={character.backgroundAsi.plus2}
                    onChange={(e) =>
                      patch({
                        backgroundAsi: { mode: "2/1", plus2: e.target.value as Ability, plus1: (character.backgroundAsi as { plus1: Ability }).plus1 },
                      })
                    }
                  >
                    {asiOptions.map((a) => (
                      <option key={a} value={a}>{ABILITY_NAMES[a]}</option>
                    ))}
                  </select>
                </label>
                <label className="field inline">
                  <span>+1</span>
                  <select
                    value={character.backgroundAsi.plus1}
                    onChange={(e) =>
                      patch({
                        backgroundAsi: { mode: "2/1", plus2: (character.backgroundAsi as { plus2: Ability }).plus2, plus1: e.target.value as Ability },
                      })
                    }
                  >
                    {asiOptions.map((a) => (
                      <option key={a} value={a}>{ABILITY_NAMES[a]}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        )}

        {choiceRules.map(({ el, r }) =>
          r.kind === "choose" ? (
            <div className="subcard" key={r.id}>
              <h3>
                {r.label} <small>({el.name}, pick {r.count ?? 1})</small>
              </h3>
              <div className="chips">
                {r.options.map((o) => {
                  const on = (character.choices[r.id] ?? []).includes(o);
                  return (
                    <button key={o} className={on ? "pill active" : "pill"} onClick={() => togglePick(r.id, o, r.count ?? 1)}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null,
        )}
      </section>

      <section className="card">
        <h2>Ability scores</h2>
        <div className="row">
          {(["pointbuy", "array", "manual"] as Method[]).map((m) => (
            <button key={m} className={method === m ? "pill active" : "pill"} onClick={() => setMethod(m)}>
              {m === "pointbuy" ? "Point buy" : m === "array" ? "Standard array" : "Manual"}
            </button>
          ))}
        </div>
        {method === "pointbuy" && (
          <p className={remaining < 0 ? "warn" : "muted"}>
            {remaining} of {POINT_BUY_BUDGET} points left
          </p>
        )}
        <table className="abilities">
          <tbody>
            {ABILITIES.map((a) => (
              <tr key={a}>
                <th>{ABILITY_NAMES[a]}</th>
                <td>
                  {method === "pointbuy" && (
                    <div className="stepper">
                      <button disabled={character.abilityBase[a] <= 8} onClick={() => setBase(a, character.abilityBase[a] - 1)}>-</button>
                      <span>{character.abilityBase[a]}</span>
                      <button
                        disabled={
                          character.abilityBase[a] >= 15 ||
                          POINT_BUY_COST[character.abilityBase[a] + 1] - POINT_BUY_COST[character.abilityBase[a]] > remaining
                        }
                        onClick={() => setBase(a, character.abilityBase[a] + 1)}
                      >
                        +
                      </button>
                    </div>
                  )}
                  {method === "array" && (
                    <select value={character.abilityBase[a]} onChange={(e) => setBase(a, Number(e.target.value))}>
                      {[8, ...STANDARD_ARRAY.filter((n) => n !== 8)].map((n) => (
                        <option key={n} value={n} disabled={n !== character.abilityBase[a] && usedArray.includes(n) && n !== 8}>
                          {n}
                        </option>
                      ))}
                    </select>
                  )}
                  {method === "manual" && (
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={character.abilityBase[a]}
                      onChange={(e) => setBase(a, Math.min(30, Math.max(1, Number(e.target.value) || 10)))}
                    />
                  )}
                </td>
                <td className="final">
                  {sheet.abilities[a].score} ({sheet.abilities[a].mod >= 0 ? "+" : ""}
                  {sheet.abilities[a].mod})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Right column is the final score after background and modifiers.</p>

        <h2>Feats, spells, items and custom modifiers</h2>
        <input placeholder="Search to add (2+ letters)..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        {extraCandidates.length > 0 && (
          <ul className="results">
            {extraCandidates.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => {
                    setCharacter((c) => ({ ...c, extras: [...c.extras, e.id] }));
                    setFilter("");
                  }}
                >
                  + {e.name} <small>{e.type}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul className="added">
          {character.extras.map((id) => (
            <li key={id}>
              {registry.get(id)?.name ?? id}
              <button onClick={() => setCharacter((c) => ({ ...c, extras: c.extras.filter((x) => x !== id) }))}>remove</button>
            </li>
          ))}
        </ul>
        {sheet.warnings.length > 0 && <p className="warn">{sheet.warnings.slice(0, 3).join(" | ")}</p>}
      </section>
    </div>
  );
}
