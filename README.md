# Maplibre expression builder

*Un constructeur fluide pour les expressions de style MapLibre GL JS : fini les tableaux imbriqués.*

## 1. Principe

MapLibre décrit ses expressions sous forme de tableaux JSON qui ressemblent à un arbre syntaxique :

```js
["+", ["*", ["get", "lanes"], 2], 1]
```

*Maplibre expression builder* permet d’écrire la même chose de façon lisible :

```js
get("lanes").mul(2).add(1)
```

Règles générales :

- **Opérations binaires** (`+`, `-`, `==`, `<`, etc.) : méthodes chaînables sur une expression, `a.add(b)`.
- **Tous les autres mots-clés** : fonctions en antéposition, `interpolate(zoom(), 0, 1, 10, 5)`.
- **`case` et `match`** : builders fluents, `iff(...).then(...).else(...)` et `match(...).case(...).else(...)`.
- Le résultat est un objet `Expr`. On récupère le tableau MapLibre avec `.build()`, ou on convertit un objet de style entier avec `resolve()`.

## 2. Import

```js
// Objet complet : tous les mots-clés, y compris if / let / var / in / typeof
import E from "./maplibre-expr.js";
E.if(get("a")).then(1).else(2);

// Imports nommés (versions « sûres » des mots réservés)
import { get, zoom, interpolate, match, iff, let_, var_, in_, typeOf } from "./maplibre-expr.js";

// Ou déstructuration depuis l’objet par défaut
const { get, zoom, interpolate, match } = E;
```

| Mot réservé / conflit | Nom dans le module |
| --- | --- |
| `if` | `iff` (ou `E.if`) |
| `let` | `let_` (ou `E.let`) |
| `var` | `var_` (ou `E.var`) |
| `in` | `in_` (ou `E.in`) |
| `typeof` | `typeOf` (ou `E.typeof`) |
| `to-string` | `toStr` (pour ne pas écraser `toString`) |
| `all` / `any` | `all` / `any`, avec les alias `and` / `or` |

## 3. Passer le résultat à MapLibre

```js
// Une expression seule
map.setPaintProperty("roads", "line-width", expr.build());

// Un objet de style entier : resolve() convertit récursivement tous les Expr
map.addLayer(E.resolve({
  id: "roads",
  type: "line",
  source: "osm",
  paint: {
    "line-color": iff(get("oneway").eq(1)).then("#e55").else("#555"),
    "line-width": interpolate(zoom(), 5, 1, 15, 8),
  },
}));
```

`JSON.stringify(expr)` fonctionne aussi, car `Expr` implémente `toJSON()`.

## 4. Conversion des arguments

Chaque argument d’une fonction ou d’une méthode est converti ainsi :

| Argument | Devient |
| --- | --- |
| `Expr` ou builder | son tableau d’expression |
| nombre, chaîne, booléen, `null` | tel quel |
| tableau JS `[1, 2, 3]` | `["literal", [1, 2, 3]]` |
| objet JS `{a: 1}` | `["literal", {a: 1}]` |

Pour insérer une expression déjà écrite à la main sous forme de tableau MapLibre, on l’enveloppe avec `raw()` :

```js
raw(["get", "name"]).upcase().build();
// ["upcase", ["get", "name"]]

["get", "name"]   // sans raw : serait traité comme un tableau littéral
```

Pour démarrer une chaîne à partir d’une valeur brute, on utilise `of()` :

```js
of(3).add(4).build();      // ["+", 3, 4]
literal([1, 2]).build();   // ["literal", [1, 2]]   (alias : lit)
```

## 5. Opérations arithmétiques

Méthodes chaînables, ou fonctions libres équivalentes.

| Opération | Méthode | Fonction libre | Résultat |
| --- | --- | --- | --- |
| `+` | `a.add(b, c…)` | `add(a, b, c…)` | `["+", a, b, c]` |
| `-` | `a.sub(b)` | `sub(a, b)` | `["-", a, b]` |
| `-` (unaire) | `a.neg()` | `neg(a)` | `["-", a]` |
| `*` | `a.mul(b, c…)` | `mul(a, b, c…)` | `["*", a, b, c]` |
| `/` | `a.div(b)` | `div(a, b)` | `["/", a, b]` |
| `%` | `a.mod(b)` | `mod(a, b)` | `["%", a, b]` |
| `^` | `a.pow(b)` | `pow(a, b)` | `["^", a, b]` |

```js
// Largeur proportionnelle à un attribut, avec un minimum
get("lanes").mul(1.5).add(1).max(2)
// ["max", ["+", ["*", ["get","lanes"], 1.5], 1], 2]

// Distance au carré
get("dx").pow(2).add(get("dy").pow(2))
```

### Fonctions mathématiques unaires

`abs`, `acos`, `asin`, `atan`, `ceil`, `cos`, `floor`, `ln`, `log10`, `log2`, `round`, `sin`, `sqrt`, `tan` existent en méthode **et** en fonction libre.

`min` et `max` sont variadiques : `max(a, b, c)` ou `a.max(b, c)`.

Les constantes sont des fonctions sans argument : `pi()`, `e()`, `ln2()`.

```js
get("area").sqrt().round()        // ["round", ["sqrt", ["get","area"]]]
get("angle").mul(pi()).div(180)   // ["/", ["*", ["get","angle"], ["pi"]], 180]
```

## 6. Comparaisons et logique

| Opération | Méthode | Fonction libre |
| --- | --- | --- |
| `==` | `a.eq(b)` | `eq(a, b)` |
| `!=` | `a.neq(b)` | `neq(a, b)` |
| `<` | `a.lt(b)` | `lt(a, b)` |
| `<=` | `a.lte(b)` | `lte(a, b)` |
| `>` | `a.gt(b)` | `gt(a, b)` |
| `>=` | `a.gte(b)` | `gte(a, b)` |
| `!` | `a.not()` | `not(a)` |
| `all` | `a.and(b, c…)` (alias `.all`) | `all(a, b, c…)` / `and(…)` |
| `any` | `a.or(b, c…)` (alias `.any`) | `any(a, b, c…)` / `or(…)` |

```js
// Population entre 10 000 et 1 000 000, hors capitale
get("pop").gte(1e4)
  .and(get("pop").lt(1e6), get("capital").not())
```

Résultat :

```json
["all",
  [">=", ["get", "pop"], 10000],
  ["<", ["get", "pop"], 1000000],
  ["!", ["get", "capital"]]]
```

### Comparaison avec un collator

Les comparateurs acceptent un collator en dernier argument :

```js
get("name").eq("école", collator({ "case-sensitive": false, "diacritic-sensitive": false }))
```

## 7. Conditions : `case` avec `iff`

Le builder s’écrit `iff(condition).then(valeur)`, éventuellement suivi de `.elseIf(condition).then(valeur)`, et se termine **obligatoirement** par `.else(valeur)`.

```js
iff(get("pop").gt(1e6)).then("red")
  .elseIf(get("pop").gt(1e5)).then("orange")
  .else("gray")
```

```json
["case",
  [">", ["get", "pop"], 1000000], "red",
  [">", ["get", "pop"], 100000], "orange",
  "gray"]
```

Pour une condition simple, la méthode `ifElse` est plus courte :

```js
get("selected").ifElse("#f00", "#999")
// ["case", ["get","selected"], "#f00", "#999"]
```

Les conditions peuvent être imbriquées, et `then` / `else` acceptent n’importe quelle expression :

```js
iff(has("height"))
  .then(get("height").mul(3))
  .else(iff(get("levels").gt(0)).then(get("levels").mul(3)).else(10))
```

> `E.if(...)` est équivalent à `iff(...)` quand on utilise l’objet par défaut.

## 8. Correspondances : `match`

Syntaxe : `match(entrée).case(label(s), sortie)…else(défaut)`. Le défaut est obligatoire.

```js
match(get("class"))
  .case("motorway", 4)
  .case(["primary", "secondary"], 2)   // plusieurs labels pour une même sortie
  .else(1)
```

```json
["match", ["get", "class"],
  "motorway", 4,
  ["primary", "secondary"], 2,
  1]
```

Points d’attention :

- Les labels doivent être des **littéraux** (nombre ou chaîne), ou un tableau de littéraux. Passer une expression lève une erreur explicite.
- Dans `.case`, un tableau n’est **pas** enveloppé dans `literal` : il est interprété comme une liste de labels, comme l’exige MapLibre.
- Les sorties sont des expressions normales :

```js
match(geometryType())
  .case("Point", get("size").mul(2))
  .case(["LineString", "MultiLineString"], 1)
  .else(0)
```

## 9. Rampes : `interpolate`, `step`

### `interpolate` (linéaire par défaut)

Syntaxe : `interpolate(entrée, in1, out1, in2, out2, …)`.

```js
interpolate(zoom(), 5, 1, 15, 8)
// ["interpolate", ["linear"], ["zoom"], 5, 1, 15, 8]
```

Variantes d’interpolation :

```js
// Exponentielle : base en premier
interpolate.exponential(1.5, zoom(), 5, 1, 15, 8)
// ["interpolate", ["exponential", 1.5], ["zoom"], 5, 1, 15, 8]

// Courbe de Bézier cubique : x1, y1, x2, y2 en premier
interpolate.cubicBezier(0.42, 0, 0.58, 1, zoom(), 5, 1, 15, 8)
// ["interpolate", ["cubic-bezier", 0.42, 0, 0.58, 1], ["zoom"], 5, 1, 15, 8]

// Explicitement linéaire
interpolate.linear(zoom(), 5, 1, 15, 8)
```

### `interpolateHcl` et `interpolateLab`

Même API, pour interpoler des couleurs dans un autre espace colorimétrique :

```js
interpolateHcl(get("temp"), -10, "#2b83ba", 15, "#ffffbf", 40, "#d7191c")
interpolateLab.exponential(2, heatmapDensity(), 0, "transparent", 1, "red")
```

Les sorties peuvent elles-mêmes être des expressions : `interpolate(zoom(), 5, get("min"), 15, get("max"))`.

### `step`

Syntaxe : `step(entrée, valeurDeBase, seuil1, sortie1, seuil2, sortie2, …)`.

```js
step(get("pop"), "#ccc", 1e4, "#fc8", 1e5, "#f84", 1e6, "#d00")
// ["step", ["get","pop"], "#ccc", 10000, "#fc8", 100000, "#f84", 1000000, "#d00"]
```

## 10. Accès aux données

| Mot-clé MapLibre | Fonction | Méthode | Remarque |
| --- | --- | --- | --- |
| `get` | `get(clé, objet?)` | `obj.get(clé)` | `get("a", properties())` |
| `has` | `has(clé, objet?)` | `obj.has(clé)` |  |
| `at` | `at(index, tableau)` | `tab.at(index)` |  |
| `in` | `in_(aiguille, botte)` | `aiguille.in_(botte)` | alias `.in`, fonctionne sur tableaux et chaînes |
| `index-of` | `indexOf(aiguille, botte, depuis?)` | `botte.indexOf(aiguille, depuis?)` |  |
| `length` | `length(x)` | `x.length()` |  |
| `slice` | `slice(x, début, fin?)` | `x.slice(début, fin?)` |  |
| `coalesce` | `coalesce(a, b, c…)` | `a.coalesce(b, c…)` | première valeur non nulle |
| `properties` | `properties()` |  |  |
| `id` | `id()` |  |  |
| `geometry-type` | `geometryType()` |  |  |
| `feature-state` | `featureState(clé)` |  |  |
| `accumulated` | `accumulated()` |  | pour les clusters |
| `line-progress` | `lineProgress()` |  | `line-gradient` uniquement |
| `heatmap-density` | `heatmapDensity()` |  | `heatmap-color` uniquement |
| `zoom` | `zoom()` |  |  |
| `config` | `config(clé)` |  | options de configuration du style |

```js
// Nom en français, sinon nom par défaut, sinon « inconnu »
coalesce(get("name:fr"), get("name"), "inconnu")

// Un élément précis d’un tableau d’attributs
get("coords").at(0)

// Test d’appartenance : "hospital" est-il dans la liste ?
get("amenity").in_(["hospital", "clinic", "pharmacy"])
// ["in", ["get","amenity"], ["literal", ["hospital","clinic","pharmacy"]]]

// Sous-chaîne
get("code").slice(0, 2)

// Hover : état de feature
iff(featureState("hover")).then("#ff0").else("#888")
```

## 11. Variables : `let` et `var`

Syntaxe : `let_({ nom: expression, … }, corps)`. Le corps peut être une expression, ou **une fonction** qui reçoit un objet de variables déjà liées.

```js
let_({ pop: get("population"), area: get("area") },
  (v) => v.pop.div(v.area)
)
```

```json
["let",
  "pop", ["get", "population"],
  "area", ["get", "area"],
  ["/", ["var", "pop"], ["var", "area"]]]
```

Avec une expression directement, on utilise `var_("nom")` :

```js
let_({ d: get("density") },
  interpolate(var_("d"), 0, "#fff", 100, "#f00")
)
```

Rappel MapLibre : `let` ne peut apparaître qu’au sommet de l’expression, et `zoom()` ne peut être utilisé qu’en entrée d’un `interpolate` ou `step` de plus haut niveau. Ces contraintes viennent de la spécification, pas du module.

## 12. Types et conversions

### Assertions

`string`, `number`, `boolean`, `object` acceptent une valeur puis des valeurs de repli :

```js
number(get("height"), get("levels"), 0)
// ["number", ["get","height"], ["get","levels"], 0]
```

`array(valeur, type?, longueur?)` réordonne les arguments comme l’exige MapLibre (type et longueur **avant** la valeur) :

```js
array(get("coords"), "number", 2)
// ["array", "number", 2, ["get","coords"]]
```

### Conversions

| Mot-clé | Fonction | Méthode |
| --- | --- | --- |
| `to-boolean` | `toBoolean(x)` | `x.toBoolean()` |
| `to-color` | `toColor(x, …)` | `x.toColor()` |
| `to-number` | `toNumber(x, …)` | `x.toNumber()` |
| `to-string` | `toStr(x)` | `x.toStr()` |
| `to-rgba` | `toRgba(c)` | `c.toRgba()` |
| `typeof` | `typeOf(x)` | `x.typeOf()` |

```js
// Une propriété textuelle « 42 » utilisée comme nombre
get("height").toNumber().mul(2)

// Nombre affiché comme texte, avec unité
get("height").toStr().concat(" m")
```

## 13. Texte

| Mot-clé | Fonction | Méthode |
| --- | --- | --- |
| `concat` | `concat(a, b, c…)` | `a.concat(b, c…)` |
| `upcase` | `upcase(x)` | `x.upcase()` |
| `downcase` | `downcase(x)` | `x.downcase()` |
| `is-supported-script` | `isSupportedScript(x)` | `x.isSupportedScript()` |
| `resolved-locale` | `resolvedLocale(collator)` |  |

```js
get("name").upcase().concat(" (", get("ref"), ")")
// ["concat", ["upcase", ["get","name"]], " (", ["get","ref"], ")"]

// Ne garder le label que si le script est supporté
iff(get("name").isSupportedScript()).then(get("name")).else(get("name:latin"))
```

### `format` et `section`

`format` accepte des contenus simples ou des sections avec options :

```js
format(
  section(get("name"), { "font-scale": 1.2, "text-font": ["Open Sans Bold"] }),
  "\n",
  section(get("ref"), { "font-scale": 0.8, "text-color": "#999" })
)
```

```json
["format",
  ["get", "name"], {"font-scale": 1.2, "text-font": ["literal", ["Open Sans Bold"]]},
  "\n", 
  ["get", "ref"], {"font-scale": 0.8, "text-color": "#999"}]
```

Les valeurs d’options peuvent être des expressions (par exemple `"text-color": get("color")`).

### `numberFormat`

```js
numberFormat(get("price"), { locale: "fr-FR", currency: "EUR", "min-fraction-digits": 2 })
// ["number-format", ["get","price"], {locale: "fr-FR", currency: "EUR", "min-fraction-digits": 2}]

// Également en méthode
get("price").numberFormat({ "max-fraction-digits": 0 })
```

### `collator` et `image`

```js
collator({ "case-sensitive": false, locale: "fr" })
image("marker")
image("marker", { params: { color: "#f00" } })
```

## 14. Couleurs

```js
rgb(255, 0, 0)                          // ["rgb", 255, 0, 0]
rgba(get("r"), get("g"), get("b"), 0.5) // ["rgba", ["get","r"], ["get","g"], ["get","b"], 0.5]
toRgba("#ff0000")                       // ["to-rgba", "#ff0000"]
```

## 15. Géométrie

`within` et `distance` prennent un objet GeoJSON passé **tel quel** (pas enveloppé dans `literal`, conformément à la spec) :

```js
within({
  type: "Polygon",
  coordinates: [[[2.2, 48.8], [2.4, 48.8], [2.4, 48.9], [2.2, 48.9], [2.2, 48.8]]],
})
// ["within", {type: "Polygon", coordinates: [...]}]

distance({ type: "Point", coordinates: [2.35, 48.85] }).lt(500)
// ["<", ["distance", {type: "Point", ...}], 500]
```

## 16. Exemples complets

### Carte choroplèthe avec interpolation de couleur

```js
import { get, zoom, interpolate, interpolateHcl, iff, has, let_, resolve } from "./maplibre-expr.js";

map.addLayer(resolve({
  id: "communes",
  type: "fill",
  source: "communes",
  paint: {
    "fill-color": let_({ d: get("population").div(get("surface")) },
      (v) => interpolateHcl(v.d, 0, "#ffffcc", 100, "#41b6c4", 1000, "#253494")
    ),
    "fill-opacity": iff(has("population")).then(0.8).else(0.2),
  },
}));
```

### Routes : largeur selon la classe et le zoom

```js
const base = match(get("class"))
  .case("motorway", 3)
  .case(["trunk", "primary"], 2)
  .case("secondary", 1.5)
  .else(1);

map.setPaintProperty("roads", "line-width", resolve(
  interpolate.exponential(1.4, zoom(), 6, base.mul(0.5), 16, base.mul(12))
));
```

> Attention : un `interpolate` sur `zoom()` doit être au sommet de l’expression, et ses sorties peuvent dépendre des données, comme ici.

### Étiquettes avec repli et formatage

```js
map.setLayoutProperty("labels", "text-field", resolve(
  format(
    section(coalesce(get("name:fr"), get("name")).upcase(), { "font-scale": 1.1 }),
    "\n",
    section(numberFormat(get("pop"), { locale: "fr-FR" }), { "font-scale": 0.8 })
  )
));
```

### Filtre sur un polygone et une liste de valeurs

```js
map.setFilter("poi", resolve(
  get("amenity").in_(["hospital", "clinic"])
    .and(within(parisPolygon), get("name").neq(""))
));
```

## 17. Pièges courants

- **`.else(...)` oublié.** `iff(...).then(...)` et `match(...).case(...)` seuls ne sont pas des expressions complètes : appeler `.build()` ou `resolve()` dessus lève une erreur explicite.
- **Tableaux JS = littéraux.** `get("a").in_([1, 2])` produit bien `["literal", [1, 2]]`. En revanche, un tableau d’expression écrit à la main doit passer par `raw(...)`.
- **Labels de `match`.** Ils ne peuvent pas être des expressions, uniquement des nombres ou des chaînes (seul ou en tableau).
- **`resolve()` oublié.** MapLibre attend de vrais tableaux. Si on lui passe un `Expr` directement, il le rejette. Il faut appeler `.build()` ou `resolve()` avant `setPaintProperty`, `setFilter` ou `addLayer`.
- **Les contraintes de la spec restent valables.** Par exemple, `zoom()` ne peut être qu’en entrée d’un `step` ou `interpolate` de plus haut niveau, et `heatmapDensity()` / `lineProgress()` ne sont valides que pour certaines propriétés. Le module construit l’expression, MapLibre la valide.
- **Types.** Les valeurs de repli de `number(...)`, `string(...)`, etc. sont des arguments supplémentaires, pas un tableau.

## 18. Table de correspondance complète

| Catégorie | Mots-clés MapLibre → fonction |
| --- | --- |
| Maths | `+` add · `-` sub / neg · `*` mul · `/` div · `%` mod · `^` pow · `abs` · `acos` · `asin` · `atan` · `ceil` · `cos` · `floor` · `ln` · `log10` · `log2` · `max` · `min` · `round` · `sin` · `sqrt` · `tan` · `pi` · `e` · `ln2` · `distance` |
| Décision | `!` not · `!=` neq · `<` lt · `<=` lte · `==` eq · `>` gt · `>=` gte · `all` all / and · `any` any / or · `case` iff · `coalesce` · `match` · `within` |
| Lookup | `at` · `get` · `has` · `in` in\_ · `index-of` indexOf · `length` · `slice` · `config` |
| Contexte | `accumulated` · `feature-state` featureState · `geometry-type` geometryType · `id` · `line-progress` lineProgress · `properties` · `zoom` · `heatmap-density` heatmapDensity |
| Types | `array` · `boolean` · `collator` · `format` · `image` · `literal` · `number` · `number-format` numberFormat · `object` · `string` · `to-boolean` toBoolean · `to-color` toColor · `to-number` toNumber · `to-string` toStr · `typeof` typeOf |
| Couleur | `rgb` · `rgba` · `to-rgba` toRgba |
| Texte | `concat` · `downcase` · `upcase` · `is-supported-script` isSupportedScript · `resolved-locale` resolvedLocale |
| Rampes | `interpolate` · `interpolate-hcl` interpolateHcl · `interpolate-lab` interpolateLab · `step` |
| Variables | `let` let\_ · `var` var\_ |
| Utilitaires du module | `raw` · `of` · `literal` / `lit` · `section` · `resolve` |
