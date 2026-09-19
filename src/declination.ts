/** WMM2025 main-field/secular-variation coefficients (NOAA NCEI/BGS, public domain).
 * https://doi.org/10.25921/aqfd-sd83 . Triangular index n*(n+1)/2+m.
 * Reference fixtures: https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt
 * No network request or additional location disclosure is needed. */
const g = [0,-29351.8,-1410.8,-2556.6,2951.1,1649.3,1361,-2404.1,1243.8,453.6,895,799.5,55.7,-281.1,12.1,-233.2,368.9,187.2,-138.7,-142,20.9,64.4,63.8,76.9,-115.7,-40.9,14.9,-60.7,79.5,-77,-8.8,59.3,15.8,2.5,-11.1,14.2,23.2,10.8,-17.5,2,-21.7,16.9,15,-16.8,0.9,4.6,7.8,3,-0.2,-2.5,-13.1,2.4,8.6,-8.7,-12.9,-1.3,-6.4,0.2,2,-1,-0.6,-0.9,1.5,0.9,-2.7,-3.9,2.9,-1.5,-2.5,2.4,-0.6,-0.1,-0.6,-0.1,1.1,-1,-0.2,2.6,-2,-0.2,0.3,1.2,-1.3,0.6,0.6,0.5,-0.1,-0.4,-0.2,-1.3,-0.7];
const h = [0,0,4545.4,0,-3133.6,-815.1,0,-56.6,237.5,-549.5,0,278.6,-133.9,212,-375.6,0,45.4,220.2,-122.9,43,106.1,0,-18.4,16.8,48.8,-59.8,10.9,72.7,0,-48.9,-14.4,-1,23.4,-7.4,-25.1,-2.3,0,7.1,-12.6,11.4,-9.7,12.7,0.7,-5.2,3.9,0,-24.8,12.2,8.3,-3.3,-5.2,7.2,-0.6,0.8,10,0,3.3,0,2.4,5.3,-9.1,0.4,-4.2,-3.8,0.9,-9.1,0,0,2.9,-0.6,0.2,0.5,-0.3,-1.2,-1.7,-2.9,-1.8,-2.3,0,-1.3,0.7,1,-1.4,0,0.6,-0.1,0.8,0.1,-1,0.1,0.2];
const dg = [0,12,9.7,-11.6,-5.2,-8,-1.3,-4.2,0.4,-15.6,-1.6,-2.4,-6,5.6,-7,0.6,1.4,0,0.6,2.2,0.9,-0.2,-0.4,0.9,1.2,-0.9,0.3,0.9,0,-0.1,-0.1,0.5,-0.1,-0.8,-0.8,0.8,-0.1,0.2,0,0.5,-0.1,0.3,0.2,0,0.2,0,-0.1,0.1,0.3,-0.3,0,0.3,-0.1,0.1,-0.1,0.1,0,0.1,0.1,0,-0.3,0,-0.1,-0.1,0,0,0,0,0,0,0,-0.1,0,0,-0.1,-0.1,-0.1,-0.1,0,0,0,0,0,0,0.1,0,0,0,-0.1,0,-0.1];
const dh = [0,0,-21.5,0,-27.7,-12.1,0,4,-0.3,-4.1,0,-1.1,4.1,1.6,-4.4,0,-0.5,2.2,0.4,1.7,1.9,0,0.3,-1.6,-0.4,0.9,0.7,0.9,0,0.6,0.5,-0.8,0,-1,0.6,-0.2,0,-0.2,0.5,-0.4,0.4,-0.5,-0.6,0.3,0.2,0,-0.3,0.3,-0.3,0.3,0.2,-0.1,-0.2,0.4,0.1,0,0,0,-0.2,0.1,-0.1,0.1,0,-0.1,0.2,0,0,0,0.1,0,0.1,0,0,0.1,0,0,0,0,0,0,0,-0.1,0.1,0,0,0,0,0,0,0,-0.1];
const rad = Math.PI / 180;
const index = (n: number, m: number) => n * (n + 1) / 2 + m;
const factorial = (n: number): number => n < 2 ? 1 : n * factorial(n - 1);
const normalization = g.map((_, i) => {
  const n = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2), m = i - index(n, 0);
  return Math.sqrt((m === 0 ? 1 : 2) * factorial(n - m) / factorial(n + m));
});
/** East-positive magnetic declination. null means outside model validity or a
 * weak/polar field, NOT zero correction. altitudeKm is WGS84 ellipsoid height. */
export function magneticDeclination(latitude: number, longitude: number, date: Date, altitudeKm = 0): number | null {
  const year = date.getUTCFullYear();
  if (![latitude, longitude, date.getTime(), altitudeKm].every(Number.isFinite) ||
    Math.abs(latitude) >= 89.99 || Math.abs(longitude) > 180 || altitudeKm < -1 || altitudeKm > 850 || year < 2025 || year >= 2030) return null;
  const decimalYear = year + (date.getTime() - Date.UTC(year, 0, 1)) / (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1));
  const dt = decimalYear - 2025, phi = latitude * rad, lambda = longitude * rad;
  const a = 6378.137, e2 = 6.69437999014e-3;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const rho = (N + altitudeKm) * Math.cos(phi), z = (N * (1 - e2) + altitudeKm) * Math.sin(phi);
  const r = Math.hypot(rho, z), geocentric = Math.atan2(z, rho), theta = Math.PI / 2 - geocentric;
  // Unnormalised associated Legendre polynomials and their theta derivatives,
  // without the Condon-Shortley phase, followed by Schmidt semi-normalisation.
  const p = new Array<number>(91).fill(0), dp = new Array<number>(91).fill(0);
  p[0] = 1;
  const s = Math.sin(theta), c = Math.cos(theta);
  let north = 0, east = 0, up = 0;
  for (let n = 1; n <= 12; n++) for (let m = 0; m <= n; m++) {
    const i = index(n, m), prev = index(n - 1, m === n ? m - 1 : m);
    if (m === n) {
      p[i] = (2 * n - 1) * s * p[prev];
      dp[i] = (2 * n - 1) * (c * p[prev] + s * dp[prev]);
    } else {
      const older = n - 2 >= m ? index(n - 2, m) : -1;
      p[i] = ((2 * n - 1) * c * p[prev] - (n + m - 1) * (p[older] ?? 0)) / (n - m);
      dp[i] = ((2 * n - 1) * (c * dp[prev] - s * p[prev]) - (n + m - 1) * (dp[older] ?? 0)) / (n - m);
    }
    const gnm = g[i] + dt * dg[i], hnm = h[i] + dt * dh[i];
    const cos = Math.cos(m * lambda), sin = Math.sin(m * lambda);
    const field = gnm * cos + hnm * sin;
    const scale = (6371.2 / r) ** (n + 2) * normalization[i];
    north += scale * field * dp[i];
    east += scale * m * (gnm * sin - hnm * cos) * p[i] / s;
    up += scale * (n + 1) * field * p[i];
  }
  const delta = phi - geocentric;
  north = north * Math.cos(delta) - up * Math.sin(delta);
  if (Math.hypot(north, east) < 2000) return null;
  return Math.atan2(east, north) / rad;
}
