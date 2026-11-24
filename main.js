/**
 * maplibre-expr.js
 * Constructeur fluent pour les expressions de style MapLibre GL JS.
 * https://maplibre.org/maplibre-style-spec/expressions/
 *
 * Règles de conversion des arguments :
 *   - Expr / builders        -> leur tableau d'expression
 *   - nombre, string, bool   -> tels quels
 *   - tableau ou objet JS    -> ["literal", ...]  (utiliser raw([...]) pour insérer
 *                                                 une expression déjà écrite à la main)
 *
 * Résultat : `.build()` (ou `.toArray()`) donne le tableau MapLibre.
 * Pour convertir récursivement un objet de style entier : `resolve(style)`.
 *
 * Exemple :
 *   import E from "./maplibre-expr.js";
 *   const { get, zoom, interpolate, match, iff } = E;
 *
 *   map.setPaintProperty("roads", "line-width", E.resolve(
 *     interpolate(zoom(), 5, 1, 15, get("lanes").mul(2).add(1))
 *   ));
 *
 *   iff(get("pop").gt(1e6)).then("red")
 *     .elseIf(get("pop").gt(1e5)).then("orange")
 *     .else("gray")
 *
 *   match(get("class"))
 *     .case("motorway", 4)
 *     .case(["primary", "secondary"], 2)
 *     .else(1)
 */

/* ------------------------------------------------------------------ */
/* Noyau                                                               */
/* ------------------------------------------------------------------ */

export class Expr {
    constructor(expr) {
        this.expr = expr;
    }
    toArray() { return this.expr; }
    build() { return this.expr; }
    toJSON() { return this.expr; }
}

class Section {
    constructor(content, options) {
        this.content = content;
        this.options = options;
    }
}

function toRaw(v) {
    if (v instanceof Expr) return v.expr;
    if (v instanceof IfBuilder || v instanceof MatchBuilder) return v.build();
    if (Array.isArray(v)) return ["literal", v];
    if (v !== null && typeof v === "object") return ["literal", v];
    return v;
}

const rawOpts = (o) =>
    o == null ? o : Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toRaw(v)]));

const trimUndefined = (args) => {
    let n = args.length;
    while (n > 0 && args[n - 1] === undefined) n--;
    return args.slice(0, n);
};

const op = (keyword) => (...args) =>
    new Expr([keyword, ...trimUndefined(args).map(toRaw)]);

/** Insère une expression déjà écrite sous forme de tableau MapLibre. */
export const raw = (arrayExpr) => new Expr(arrayExpr);

/** Enveloppe une valeur (sans ["literal"]) pour démarrer une chaîne : of(3).add(4) */
export const of = (v) => (v instanceof Expr ? v : new Expr(toRaw(v)));

/** ["literal", valeur] */
export const literal = (v) => new Expr(["literal", v]);
export const lit = literal;

/** Convertit récursivement tout Expr/builder contenu dans un objet/tableau. */
export function resolve(v) {
    if (v instanceof Expr) return v.expr;
    if (v instanceof IfBuilder || v instanceof MatchBuilder) return v.build();
    if (Array.isArray(v)) return v.map(resolve);
    if (v !== null && typeof v === "object")
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
    return v;
}

/* ------------------------------------------------------------------ */
/* Fonctions simples : nomJS -> mot-clé MapLibre                       */
/* ------------------------------------------------------------------ */

const F = {};

const SIMPLE = {
    // Maths
    add: "+", sub: "-", mul: "*", div: "/", mod: "%", pow: "^",
    abs: "abs", acos: "acos", asin: "asin", atan: "atan", ceil: "ceil",
    cos: "cos", floor: "floor", ln: "ln", log10: "log10", log2: "log2",
    max: "max", min: "min", round: "round", sin: "sin", sqrt: "sqrt", tan: "tan",
    // Constantes / contexte
    pi: "pi", e: "e", ln2: "ln2", zoom: "zoom",
    heatmapDensity: "heatmap-density", lineProgress: "line-progress",
    accumulated: "accumulated", geometryType: "geometry-type", id: "id",
    properties: "properties", featureState: "feature-state", config: "config",
    // Décision
    eq: "==", neq: "!=", lt: "<", lte: "<=", gt: ">", gte: ">=",
    not: "!", all: "all", any: "any", and: "all", or: "any", coalesce: "coalesce",
    // Lookup
    get: "get", has: "has", at: "at", in_: "in", indexOf: "index-of",
    length: "length", slice: "slice",
    // Texte
    concat: "concat", upcase: "upcase", downcase: "downcase",
    isSupportedScript: "is-supported-script", resolvedLocale: "resolved-locale",
    // Couleur
    rgb: "rgb", rgba: "rgba", toRgba: "to-rgba",
    // Types
    string: "string", number: "number", boolean: "boolean", object: "object",
    typeOf: "typeof", toBoolean: "to-boolean", toColor: "to-color",
    toNumber: "to-number", toStr: "to-string",
    // Variables
    var_: "var",
};
for (const [name, kw] of Object.entries(SIMPLE)) F[name] = op(kw);

/* Négation unaire : neg(x) -> ["-", x] */
F.neg = (x) => new Expr(["-", toRaw(x)]);

/* ------------------------------------------------------------------ */
/* Fonctions spéciales                                                 */
/* ------------------------------------------------------------------ */

F.literal = literal;
F.lit = literal;

// Géométries GeoJSON : passées telles quelles (pas de ["literal"])
F.within = (geojson) => new Expr(["within", geojson]);
F.distance = (geojson) => new Expr(["distance", geojson]);

// ["array", type?, length?, value]
F.array = (value, type, length) =>
    new Expr([
        "array",
        ...(type !== undefined ? [type] : []),
        ...(length !== undefined ? [length] : []),
        toRaw(value),
    ]);

F.collator = (options) => new Expr(["collator", rawOpts(options)]);
F.image = (name, options) =>
    new Expr(["image", toRaw(name), ...(options ? [rawOpts(options)] : [])]);
F.numberFormat = (value, options) =>
    new Expr(["number-format", toRaw(value), rawOpts(options || {})]);

/** section(contenu, {options}) pour format() */
export const section = (content, options) => new Section(content, options);
F.section = section;
F.format = (...parts) =>
    new Expr([
        "format",
        ...parts.flatMap((p) =>
            p instanceof Section
                ? [toRaw(p.content), rawOpts(p.options || {})]
                : [toRaw(p)]
        ),
    ]);

// step(input, base, in1, out1, in2, out2, ...)
F.step = (input, base, ...stops) =>
    new Expr(["step", toRaw(input), toRaw(base), ...stops.map(toRaw)]);

// interpolate(input, in1, out1, in2, out2, ...)           -> linéaire
// interpolate.exponential(base, input, ...stops)
// interpolate.cubicBezier(x1, y1, x2, y2, input, ...stops)
function makeInterp(keyword) {
    const build = (type, input, stops) =>
        new Expr([keyword, type, toRaw(input), ...stops.map(toRaw)]);
    const f = (input, ...stops) => build(["linear"], input, stops);
    f.linear = f;
    f.exponential = (base, input, ...stops) => build(["exponential", base], input, stops);
    f.cubicBezier = (x1, y1, x2, y2, input, ...stops) =>
        build(["cubic-bezier", x1, y1, x2, y2], input, stops);
    return f;
}
F.interpolate = makeInterp("interpolate");
F.interpolateHcl = makeInterp("interpolate-hcl");
F.interpolateLab = makeInterp("interpolate-lab");

// let({a: expr, b: expr}, body)  ou  let({a: ...}, (v) => v.a.add(1))
F.let_ = (bindings, body) => {
    const names = Object.keys(bindings);
    const flat = names.flatMap((n) => [n, toRaw(bindings[n])]);
    const vars = Object.fromEntries(names.map((n) => [n, F.var_(n)]));
    const b = typeof body === "function" ? body(vars) : body;
    return new Expr(["let", ...flat, toRaw(b)]);
};

/* ---- if(cond).then(x).elseIf(cond).then(y).else(z)  ->  "case" ---- */

class IfBuilder {
    constructor(cond) {
        this.parts = [];
        this.cond = toRaw(cond);
    }
    then(value) {
        if (this.cond === null) throw new Error("then() sans condition préalable");
        this.parts.push(this.cond, toRaw(value));
        this.cond = null;
        return this;
    }
    elseIf(cond) {
        if (this.cond !== null) throw new Error("elseIf() : then() manquant");
        this.cond = toRaw(cond);
        return this;
    }
    else(value) {
        if (this.cond !== null) throw new Error("else() : then() manquant");
        return new Expr(["case", ...this.parts, toRaw(value)]);
    }
    build() {
        throw new Error('Expression "case" incomplète : il manque .else(...)');
    }
    toJSON() { return this.build(); }
}
F.iff = (cond) => new IfBuilder(cond);

/* ---- match(input).case(label(s), out).case(...).else(fallback) ---- */

class MatchBuilder {
    constructor(input) {
        this.input = toRaw(input);
        this.cases = [];
    }
    /** labels : valeur littérale ou tableau de valeurs littérales */
    case(labels, output) {
        const bad = (l) => l !== null && typeof l === "object" && !Array.isArray(l);
        if (bad(labels) || (Array.isArray(labels) && labels.some(bad)) || labels instanceof Expr)
            throw new Error("match().case() : les labels doivent être des littéraux (nombre/string)");
        this.cases.push(labels, toRaw(output));
        return this;
    }
    else(fallback) {
        return new Expr(["match", this.input, ...this.cases, toRaw(fallback)]);
    }
    default(fallback) { return this.else(fallback); }
    build() {
        throw new Error('Expression "match" incomplète : il manque .else(...)');
    }
    toJSON() { return this.build(); }
}
F.match = (input) => new MatchBuilder(input);

/* ------------------------------------------------------------------ */
/* Méthodes chaînables sur Expr                                        */
/* ------------------------------------------------------------------ */

// `this` devient le premier argument : a.add(b) -> ["+", a, b]
const THIS_FIRST = [
    "add", "sub", "mul", "div", "mod", "pow", "neg",
    "eq", "neq", "lt", "lte", "gt", "gte",
    "not", "and", "or", "coalesce",
    "abs", "acos", "asin", "atan", "ceil", "cos", "floor", "ln", "log10", "log2",
    "max", "min", "round", "sin", "sqrt", "tan",
    "concat", "upcase", "downcase", "length", "slice", "isSupportedScript",
    "toBoolean", "toColor", "toNumber", "toStr", "toRgba", "typeOf",
    "numberFormat",
];
for (const n of THIS_FIRST) {
    Expr.prototype[n] = function (...args) { return F[n](this, ...args); };
}
Expr.prototype.all = Expr.prototype.and;
Expr.prototype.any = Expr.prototype.or;
Expr.prototype.in_ = function (haystack) { return F.in_(this, haystack); };   // this ∈ haystack
Expr.prototype.in = Expr.prototype.in_;

// `this` est l'objet / le tableau / la chaîne cible
Expr.prototype.get = function (key) { return F.get(key, this); };             // ["get", key, this]
Expr.prototype.has = function (key) { return F.has(key, this); };
Expr.prototype.at = function (index) { return F.at(index, this); };           // ["at", index, this]
Expr.prototype.indexOf = function (needle, from) { return F.indexOf(needle, this, from); };
Expr.prototype.ifElse = function (a, b) {                                     // ["case", this, a, b]
    return new Expr(["case", this.expr, toRaw(a), toRaw(b)]);
};

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

// Alias pour les mots réservés JS
F.if = F.iff;
F.in = F.in_;
F.let = F.let_;
F.var = F.var_;
F.typeof = F.typeOf;
F.toString_ = F.toStr;

const E = Object.assign(F, { Expr, raw, of, resolve });
export default E;

export const {
    // maths
    add, sub, mul, div, mod, pow, neg,
    abs, acos, asin, atan, ceil, cos, floor, ln, log10, log2,
    max, min, round, sin, sqrt, tan, distance,
    // constantes / contexte
    pi, e, ln2, zoom, heatmapDensity, lineProgress, accumulated, geometryType,
    id, properties, featureState, config,
    // décision
    eq, neq, lt, lte, gt, gte, not, all, any, and, or, coalesce, within,
    iff, match,
    // lookup
    get, has, at, in_, indexOf, length, slice,
    // texte
    concat, upcase, downcase, isSupportedScript, resolvedLocale, format,
    numberFormat, collator, image,
    // couleur
    rgb, rgba, toRgba,
    // types
    string, number, boolean, object, array, typeOf,
    toBoolean, toColor, toNumber, toStr,
    // rampes
    interpolate, interpolateHcl, interpolateLab, step,
    // variables
    let_, var_,
} = F;