"""Construye data/salaries.json a partir del crudo del INE.

    python scripts/build_dataset.py

Lee data/raw/ine_36830.json (lo deja ahí fetch_ine.py, y va commiteado, así que esto
funciona sin red). Cualquier oficio de data/occupations.yml que no case con una serie
del INE se avisa por pantalla: nunca se descarta en silencio.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

import numpy as np
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from curves import SalaryDistribution  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw" / "ine_36830.json"

# Rejilla de euros compartida por todos los oficios: es lo que permite comparar las
# campanas de un vistazo sobre el mismo eje.
GRID_MAX = 120_000.0
GRID_N = 481

# Percentiles enteros para la curva de cuantiles. El tramo 10–90 está publicado; el
# resto sale del ajuste lognormal y la página lo marca como modelado.
QUANTILE_PS = np.arange(1, 100) / 100.0
MEASURED_LO, MEASURED_HI = 0.10, 0.90

TOTAL_ROW = "Todas las ocupaciones"

STAT_KEYS = {
    "media": "mean",
    "percentil 10": "p10",
    "cuartil inferior": "p25",
    "percentil 25": "p25",
    "mediana": "p50",
    "percentil 50": "p50",
    "cuartil superior": "p75",
    "percentil 75": "p75",
    "percentil 90": "p90",
}
PCT_FIELDS = {"p10": 0.10, "p25": 0.25, "p50": 0.50, "p75": 0.75, "p90": 0.90}


def normalise(text: str) -> str:
    """Minúsculas y sin acentos, para casar nombres con tolerancia."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text.lower()).strip()


# ---------------------------------------------------------------- datos del INE


def _series_fields(serie: dict) -> dict[str, str]:
    """Extrae sexo / ocupación / estadístico de una serie de la tabla 36830.

    La tabla no trae MetaData y el nombre viene como
    "Total Nacional. Dato base. <sexo>. <ocupación>. <estadístico>."
    Se trocea desde el final, que es la parte estable del formato.
    """
    partes = [p.strip() for p in (serie.get("Nombre") or "").split(".") if p.strip()]
    if len(partes) < 3:
        return {}
    return {"stat": partes[-1], "occupation": partes[-2], "sex": partes[-3]}


def _latest_value(serie: dict) -> tuple[float | None, int | None, bool]:
    """Último valor de la serie, su año, y si procede de una muestra pequeña.

    El INE antepone un signo menos al dato cuando el número de observaciones
    muestrales está entre 100 y 500, para avisar de que la cifra está sujeta a gran
    variabilidad. No es un dato suprimido: la magnitud es la estimación real. Se toma
    en valor absoluto y se marca, en lugar de descartarlo.
    """
    datos = [d for d in (serie.get("Data") or []) if d.get("Valor") is not None]
    if not datos:
        return None, None, False
    ultimo = max(datos, key=lambda d: (d.get("Anyo") or 0))
    valor = float(ultimo["Valor"])
    return abs(valor), ultimo.get("Anyo"), valor < 0


def load_ine() -> tuple[dict[str, dict], int | None]:
    """Devuelve {nombre_ocupación: {stat: valor, low_sample: bool}} y el año."""
    series = json.loads(RAW.read_text(encoding="utf-8"))
    por_ocupacion: dict[str, dict] = {}
    año: int | None = None

    for serie in series:
        campos = _series_fields(serie)
        ocupacion = campos.get("occupation")
        if not ocupacion:
            continue

        # Sólo el total; el desglose por sexo no entra en este gráfico.
        if "ambos" not in normalise(campos.get("sex", "")):
            continue

        stat = STAT_KEYS.get(normalise(campos.get("stat", "")))
        if stat is None:
            continue

        valor, anyo, poca_muestra = _latest_value(serie)
        if valor is None or valor <= 0:
            continue
        año = anyo or año

        entrada = por_ocupacion.setdefault(ocupacion, {})
        # Algunos nombres llegan por duplicado, porque el subgrupo principal es único
        # dentro de su gran grupo y el INE publica ambos niveles. Los valores
        # coinciden; si algún día no coincidieran, preferimos enterarnos.
        if stat in entrada and abs(entrada[stat] - valor) > 0.01:
            print(f"  ⚠  {ocupacion!r}: dos valores distintos de {stat} "
                  f"({entrada[stat]} y {valor})")
        entrada[stat] = valor
        entrada["low_sample"] = entrada.get("low_sample", False) or poca_muestra

    return por_ocupacion, año


def match_occupation(spec: dict, disponibles: dict[str, dict]) -> str | None:
    """Localiza la serie del INE por su nombre exacto.

    La tabla 36830 no publica códigos CNO, sólo nombres, así que el emparejamiento por
    texto es todo lo que hay. occupations.yml se genera resolviendo estos nombres
    contra el propio crudo, de modo que en la práctica siempre es un acierto directo;
    la comparación tolerante a acentos queda como red de seguridad.
    """
    nombre = spec["ine"]
    if nombre in disponibles:
        return nombre
    plano = normalise(nombre)
    return next((n for n in disponibles if normalise(n) == plano), None)


# ------------------------------------------------------------------ ensamblado


def build_curve(pcts: dict[float, float], grid: np.ndarray) -> dict:
    dist = SalaryDistribution(pcts)
    densidad = dist.density(grid)
    pico = float(densidad.max())
    if pico <= 0:
        raise ValueError("densidad nula sobre la rejilla")

    # Se recorta el tramo con densidad despreciable y se guarda el índice de inicio:
    # así el JSON no arrastra cientos de ceros por oficio. El umbral es visual, no
    # estadístico: por debajo del 0,2% del pico la curva ya es una raya plana que sólo
    # aporta ruido horizontal al apilar las campanas.
    significativo = np.nonzero(densidad > pico * 2e-3)[0]
    i0, i1 = int(significativo[0]), int(significativo[-1])

    q = dist.quantile(QUANTILE_PS)
    p10, p50, p90 = (float(dist.quantile(p)) for p in (0.10, 0.50, 0.90))

    return {
        "i0": i0,
        "d": [round(float(v), 4) for v in densidad[i0 : i1 + 1] / pico],
        "peak": pico,
        "tail_above": round(dist.mass_above(float(grid[-1])), 5),
        # Curva de cuantiles: su pendiente es la desigualdad interna del oficio.
        "q": [round(float(v), 1) for v in q],
        "spread": {
            "p90_p10": round(p90 / p10, 3),
            "p90_p50": round(p90 / p50, 3),
            "p50_p10": round(p50 / p10, 3),
        },
    }


def main() -> int:
    if not RAW.exists():
        raise SystemExit(
            f"Falta {RAW.relative_to(ROOT)}. Ejecuta antes: python scripts/fetch_ine.py"
        )

    spec = yaml.safe_load((DATA / "occupations.yml").read_text(encoding="utf-8"))
    referencia = yaml.safe_load((DATA / "reference.yml").read_text(encoding="utf-8"))

    ine, año = load_ine()
    print(f"Crudo del INE: {len(ine)} ocupaciones con datos, periodo {año}")

    grid = np.linspace(0.0, GRID_MAX, GRID_N)
    salida: list[dict] = []
    sin_casar: list[str] = []

    for entry in spec["occupations"]:
        nombre = match_occupation(entry, ine)
        if nombre is None:
            sin_casar.append(f"{entry['label']} → {entry['ine']!r}")
            continue

        valores = ine[nombre]
        faltan = [f for f in PCT_FIELDS if f not in valores]
        if faltan:
            sin_casar.append(f"{entry['label']} (sin {', '.join(faltan)})")
            continue

        pcts = {p: float(valores[campo]) for campo, p in PCT_FIELDS.items()}
        try:
            curva = build_curve(pcts, grid)
        except ValueError as exc:
            sin_casar.append(f"{entry['label']} (curva inválida: {exc})")
            continue

        salida.append(
            {
                "id": entry["id"],
                "label": entry["label"],
                "official": nombre,
                "family": entry["family"],
                "percentiles": {
                    str(int(p * 100)): round(v, 2) for p, v in sorted(pcts.items())
                },
                "mean": round(float(valores["mean"]), 2) if "mean" in valores else None,
                "low_sample": bool(valores.get("low_sample")),
                **curva,
            }
        )

    salida.sort(key=lambda o: o["percentiles"]["50"])

    if sin_casar:
        print("\n⚠  Oficios de occupations.yml que no han entrado:")
        for item in sin_casar:
            print(f"     {item}")

    # Las referencias nacionales se toman del propio INE cuando existen; el SMI, que la
    # encuesta no publica, sigue viniendo de reference.yml.
    total = ine.get(TOTAL_ROW, {})
    markers = [m for m in referencia["markers"] if m["id"] == "smi"]
    for ident, campo, label in [("mediana", "p50", "Mediana"), ("media", "mean", "Media")]:
        if campo in total:
            markers.append({
                "id": ident, "label": label, "value": round(total[campo], 2),
                "year": año, "source": "INE, tabla 36830, todas las ocupaciones",
            })
    markers.sort(key=lambda m: m["value"])

    documento = {
        "meta": {
            "title": "Distribución salarial por oficio en España",
            "source": "INE, Encuesta de Estructura Salarial, tabla 36830",
            "source_url": "https://www.ine.es/jaxiT3/Tabla.htm?t=36830",
            "classification": spec["meta"]["classification"],
            "level": spec["meta"]["level"],
            "coverage_note": spec["meta"]["note"].strip(),
            "year": año,
            "generated": date.today().isoformat(),
            "grid": {"min": 0.0, "max": GRID_MAX, "n": GRID_N},
            "quantile_ps": [round(float(v), 2) for v in QUANTILE_PS],
            "measured_range": [MEASURED_LO, MEASURED_HI],
            "national": {k: round(v, 2) for k, v in total.items() if k != "low_sample"},
        },
        "families": spec["families"],
        "markers": markers,
        "occupations": salida,
    }

    destino = DATA / "salaries.json"
    destino.write_text(json.dumps(documento, ensure_ascii=False), encoding="utf-8")

    poca = [o["label"] for o in salida if o["low_sample"]]
    print(f"\n{len(salida)} oficios escritos en {destino.relative_to(ROOT)} "
          f"({destino.stat().st_size / 1024:.0f} KB)")
    if salida:
        print(f"  mediana más baja:  {salida[0]['label']} — {salida[0]['percentiles']['50']:,.0f} €")
        print(f"  mediana más alta:  {salida[-1]['label']} — {salida[-1]['percentiles']['50']:,.0f} €")
    if poca:
        print(f"  muestra pequeña (100–500 obs., gran variabilidad): {', '.join(poca)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
