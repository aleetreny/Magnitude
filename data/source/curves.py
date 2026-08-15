"""Reconstrucción de la distribución salarial de un oficio a partir de sus percentiles.

El INE publica, para cada subgrupo principal de la CNO-11, seis cifras: la media y
los percentiles 10, 25, 50, 75 y 90 del salario bruto anual. De ahí hay que sacar
una campana continua sin inventarse la forma.

El método tiene tres piezas:

1. Se trabaja en espacio log-salario. La distribución salarial es marcadamente
   asimétrica a la derecha pero aproximadamente lognormal, así que en logaritmos la
   campana queda casi simétrica y la interpolación se comporta.

2. Las colas (por debajo de P10 y por encima de P90) no están publicadas. Se
   prolongan con la pendiente *local* del borde: la de (P10, P25) hacia abajo y la de
   (P75, P90) hacia arriba, medidas en coordenadas (Φ⁻¹(p), log salario). Es la única
   parte extrapolada.

   Antes esto se hacía con una lognormal ajustada por mínimos cuadrados a los cinco
   percentiles a la vez, y estaba mal. Cuando un oficio se aleja de la lognormal el
   ajuste promedio no respeta los extremos: en el profesorado, con P10 = 13.252 € y
   P25 = 26.338 € (el salto que deja la jornada parcial), colocaba el P5 sintético por
   encima del P10 realmente publicado. La pendiente local arranca justo en el
   percentil publicado y sigue creciendo, así que la monotonía está garantizada por
   construcción y la cola continúa la tendencia que de verdad se observa en el borde
   del dato, no una media global. También es menos ingenua hacia arriba: donde el
   techo está comprimido, como en la enseñanza, la cola resultante se aplana en vez de
   dispararse.

3. Se interpola de forma monótona (PCHIP) la función cuantil en coordenadas
   (Φ⁻¹(p), log salario). Al ser monótona no hay overshoot ni ondulaciones
   espurias, y la curva pasa exactamente por los percentiles publicados.

La densidad sale entonces en forma cerrada por cambio de variable, sin
diferenciación numérica:

    x(z) = exp(g(z)),  z = Φ⁻¹(p),  g = interpolante PCHIP

    f(x(z)) = φ(z) / (x(z) · g'(z))
"""

from __future__ import annotations

import numpy as np
from scipy.interpolate import PchipInterpolator
from scipy.stats import norm

# Percentiles que publica el INE en la tabla 36830.
PUBLISHED_PS = (0.10, 0.25, 0.50, 0.75, 0.90)

# Percentiles a los que se colocan los anclajes de cola. Llegan hasta 1e-5 y 1-1e-5
# para que el soporte cubra prácticamente toda la masa: así la densidad integra a uno
# y no hace falta ninguna extrapolación a trozos. Tan lejos del centro los anclajes son
# ya colineales, de modo que allí el PCHIP reproduce exactamente la recta del borde.
TAIL_PS = (
    1e-5, 1e-4, 1e-3, 0.005, 0.02, 0.05,
    0.95, 0.98, 0.995, 0.999, 0.9999, 0.99999,
)


def local_slope(z: np.ndarray, y: np.ndarray, lower: bool) -> float:
    """Pendiente dy/dz medida en el borde: entre los dos puntos más bajos o más altos.

    Es lo que gobierna cómo se prolonga cada cola.
    """
    a, b = (0, 1) if lower else (-2, -1)
    return float((y[b] - y[a]) / (z[b] - z[a]))


class SalaryDistribution:
    """Distribución de salario reconstruida a partir de percentiles publicados."""

    def __init__(self, percentiles: dict[float, float], mean: float | None = None):
        ps = np.array(sorted(percentiles), dtype=float)
        values = np.array([percentiles[p] for p in ps], dtype=float)

        if np.any(np.diff(values) <= 0):
            raise ValueError("los percentiles deben ser estrictamente crecientes")
        if np.any(values <= 0):
            raise ValueError("los salarios deben ser positivos")

        if len(ps) < 3:
            raise ValueError("hacen falta al menos tres percentiles publicados")

        self.percentiles = dict(zip(ps, values))
        self.mean = mean

        z = norm.ppf(ps)
        y = np.log(values)
        self.slope_lo = local_slope(z, y, lower=True)
        self.slope_hi = local_slope(z, y, lower=False)

        # Cada cola arranca en su percentil publicado y sigue con la pendiente del
        # borde. Como ambas pendientes son positivas (los percentiles crecen), los
        # anclajes sintéticos no pueden cruzarse con los reales.
        tail_lo = np.array([p for p in TAIL_PS if p < ps[0]])
        tail_hi = np.array([p for p in TAIL_PS if p > ps[-1]])
        vals_lo = np.exp(y[0] + self.slope_lo * (norm.ppf(tail_lo) - z[0]))
        vals_hi = np.exp(y[-1] + self.slope_hi * (norm.ppf(tail_hi) - z[-1]))

        all_ps = np.concatenate([tail_lo, ps, tail_hi])
        all_values = np.concatenate([vals_lo, values, vals_hi])

        if np.any(np.diff(all_values) <= 0):
            raise ValueError("los anclajes de cola no salen monótonos")

        self._z = norm.ppf(all_ps)
        self._g = PchipInterpolator(self._z, np.log(all_values), extrapolate=False)
        self._dg = self._g.derivative()
        self.p_min, self.p_max = float(all_ps[0]), float(all_ps[-1])

    def quantile(self, p: np.ndarray | float) -> np.ndarray:
        """Salario por debajo del cual queda la fracción p de asalariados."""
        return np.exp(self._g(norm.ppf(np.asarray(p, dtype=float))))

    def density(self, x: np.ndarray) -> np.ndarray:
        """Densidad de probabilidad evaluada en una rejilla de euros.

        Se construye la curva paramétrica (x(z), f(z)) y se reinterpola sobre la
        rejilla pedida. Fuera del rango cubierto por los anclajes, densidad cero.
        """
        z = np.linspace(self._z[0], self._z[-1], 4000)
        xs = np.exp(self._g(z))
        fs = norm.pdf(z) / (xs * self._dg(z))
        return np.interp(np.asarray(x, dtype=float), xs, fs, left=0.0, right=0.0)

    def cdf(self, x: np.ndarray | float) -> np.ndarray:
        """Fracción de asalariados del oficio que cobra menos que x.

        Fuera del soporte se satura en 0 y 1: el modelo declara que más allá de los
        anclajes extremos (p = 1e-5 y 1 - 1e-5) no queda masa apreciable.
        """
        z = np.linspace(self._z[0], self._z[-1], 4000)
        xs = np.exp(self._g(z))
        ps = norm.cdf(z)
        return np.interp(np.asarray(x, dtype=float), xs, ps, left=0.0, right=1.0)

    def mass_above(self, x: float) -> float:
        """Fracción de masa que queda por encima de x (la cola que el gráfico recorta)."""
        return float(1.0 - self.cdf(x))
