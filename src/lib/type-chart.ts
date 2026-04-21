/*
Input: A defender-side Pokemon type name.
Transformation: Looks up the Gen 6+ matchup row for that type — keyed by attacking type — baked
into this constant so team analysis can run purely offline (no PokeAPI roundtrips for the 18x18
defensive grid).
Output: Partial record where missing attackers default to 1x (neutral).
*/
export const ALL_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

export type PokemonType = (typeof ALL_TYPES)[number];

export const typeChart: Record<PokemonType, Partial<Record<PokemonType, number>>> = {
  normal: { fighting: 2, ghost: 0 },
  fire: {
    water: 2,
    ground: 2,
    rock: 2,
    fire: 0.5,
    grass: 0.5,
    ice: 0.5,
    bug: 0.5,
    steel: 0.5,
    fairy: 0.5,
  },
  water: { electric: 2, grass: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
  electric: { ground: 2, electric: 0.5, flying: 0.5, steel: 0.5 },
  grass: {
    fire: 2,
    ice: 2,
    poison: 2,
    flying: 2,
    bug: 2,
    water: 0.5,
    electric: 0.5,
    grass: 0.5,
    ground: 0.5,
  },
  ice: { fire: 2, fighting: 2, rock: 2, steel: 2, ice: 0.5 },
  fighting: { flying: 2, psychic: 2, fairy: 2, bug: 0.5, rock: 0.5, dark: 0.5 },
  poison: {
    ground: 2,
    psychic: 2,
    grass: 0.5,
    fighting: 0.5,
    poison: 0.5,
    bug: 0.5,
    fairy: 0.5,
  },
  ground: { water: 2, grass: 2, ice: 2, poison: 0.5, rock: 0.5, electric: 0 },
  flying: { electric: 2, ice: 2, rock: 2, grass: 0.5, fighting: 0.5, bug: 0.5, ground: 0 },
  psychic: { bug: 2, ghost: 2, dark: 2, fighting: 0.5, psychic: 0.5 },
  bug: { fire: 2, flying: 2, rock: 2, grass: 0.5, fighting: 0.5, ground: 0.5 },
  rock: {
    water: 2,
    grass: 2,
    fighting: 2,
    ground: 2,
    steel: 2,
    normal: 0.5,
    fire: 0.5,
    poison: 0.5,
    flying: 0.5,
  },
  ghost: { ghost: 2, dark: 2, poison: 0.5, bug: 0.5, normal: 0, fighting: 0 },
  dragon: { ice: 2, dragon: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, grass: 0.5 },
  dark: { fighting: 2, bug: 2, fairy: 2, ghost: 0.5, dark: 0.5, psychic: 0 },
  steel: {
    fire: 2,
    fighting: 2,
    ground: 2,
    normal: 0.5,
    grass: 0.5,
    ice: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 0.5,
    dragon: 0.5,
    steel: 0.5,
    fairy: 0.5,
    poison: 0,
  },
  fairy: { poison: 2, steel: 2, fighting: 0.5, bug: 0.5, dark: 0.5, dragon: 0 },
};

/*
Input: A PokemonType key.
Transformation: Maps to the widely-used "Pokemon Showdown"-style palette for glanceable badges.
Output: Hex color string used as the pill background (paired with white foreground text).
*/
export const TYPE_COLORS: Record<PokemonType, string> = {
  normal: "#A8A878",
  fire: "#F08030",
  water: "#6890F0",
  electric: "#F8D030",
  grass: "#78C850",
  ice: "#98D8D8",
  fighting: "#C03028",
  poison: "#A040A0",
  ground: "#E0C068",
  flying: "#A890F0",
  psychic: "#F85888",
  bug: "#A8B820",
  rock: "#B8A038",
  ghost: "#705898",
  dragon: "#7038F8",
  dark: "#705848",
  steel: "#B8B8D0",
  fairy: "#EE99AC",
};

/*
Input: A Pokemon's defending types (1 or 2 entries, e.g. ['water', 'ground']) and a single attacking type.
Transformation: Multiplies each defender-side multiplier from `typeChart` together — this is how
dual typings stack (Gen 6+ rules). Missing rows or attackers fall back to 1 (neutral).
Output: The final damage multiplier the Pokemon would take (0, 0.25, 0.5, 1, 2, or 4).
*/
export function getEffectiveness(defenderTypes: string[], attacker: string): number {
  return defenderTypes.reduce((product, defender) => {
    const row = typeChart[defender as PokemonType];
    if (!row) return product;
    const multiplier = row[attacker as PokemonType];
    return product * (multiplier === undefined ? 1 : multiplier);
  }, 1);
}
