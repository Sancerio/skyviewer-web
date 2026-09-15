export interface SearchableSkyObject {
  id: string;
  name: string;
  constellation?: string;
  aliases?: string[];
}

const greekNames: Record<string, string> = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  δ: "delta",
  ε: "epsilon",
  ϵ: "epsilon",
  ζ: "zeta",
  η: "eta",
  θ: "theta",
  ϑ: "theta",
  ι: "iota",
  κ: "kappa",
  ϰ: "kappa",
  λ: "lambda",
  μ: "mu",
  µ: "mu",
  ν: "nu",
  ξ: "xi",
  ο: "omicron",
  π: "pi",
  ϖ: "pi",
  ρ: "rho",
  ϱ: "rho",
  σ: "sigma",
  ς: "sigma",
  τ: "tau",
  υ: "upsilon",
  φ: "phi",
  ϕ: "phi",
  χ: "chi",
  ψ: "psi",
  ω: "omega",
};

/**
 * Matches one normalized query against each searchable field independently.
 * Separators are ignored, so `HIP32349`, `HIP 32349`, and `hip-32349` agree.
 */
export function matchesObject(
  object: SearchableSkyObject,
  query: string,
): boolean {
  const needle = normalizeSearchText(query);
  if (!needle) return true;

  const fields = [
    object.id,
    object.name,
    object.constellation,
    ...(object.aliases ?? []),
  ];
  return fields.some(
    (field) =>
      field !== undefined && normalizeSearchText(field).includes(needle),
  );
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(
      /[αβγδεϵζηθϑικϰλμµνξοπϖρϱσςτυφϕχψω]/gu,
      (letter) => greekNames[letter],
    )
    .replace(/\p{M}/gu, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}
