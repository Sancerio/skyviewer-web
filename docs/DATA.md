# Astronomy data and coordinate conventions

Skyviewer bundles the following files from
[D3 Celestial](https://github.com/ofrohn/d3-celestial), retrieved on 2026-09-15
at commit [`7e720a3`](https://github.com/ofrohn/d3-celestial/tree/7e720a3de062059d4c5400a379146a601d9010e0):

| Local file                           | Upstream file                                                                                                                                           | Purpose                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/data/stars.6.json`              | [`data/stars.6.json`](https://github.com/ofrohn/d3-celestial/blob/7e720a3de062059d4c5400a379146a601d9010e0/data/stars.6.json)                           | 5,044 Hipparcos stars through visual magnitude 6         |
| `src/data/starnames.json`            | [`data/starnames.json`](https://github.com/ofrohn/d3-celestial/blob/7e720a3de062059d4c5400a379146a601d9010e0/data/starnames.json)                       | Proper names, designations, and constellation membership |
| `src/data/constellations.json`       | [`data/constellations.json`](https://github.com/ofrohn/d3-celestial/blob/7e720a3de062059d4c5400a379146a601d9010e0/data/constellations.json)             | IAU names for the 88 constellations                      |
| `src/data/constellations.lines.json` | [`data/constellations.lines.json`](https://github.com/ofrohn/d3-celestial/blob/7e720a3de062059d4c5400a379146a601d9010e0/data/constellations.lines.json) | Western constellation figure lines                       |

The upstream documentation identifies XHIP (Anderson & Francis, 2012,
VizieR V/137D) as the star-position source. Star names and designations are
compiled from VizieR cross-indexes and Stellarium sky cultures. Constellation
names originate with the IAU; the figure lines include modifications by D3
Celestial author Olaf Frohn. The figures are illustrative line traditions, not
official IAU boundaries.

## Coordinate handling

D3 Celestial states that all bundled coordinates use the J2000 epoch. Its
GeoJSON first coordinate is right ascension converted from 0–24 sidereal hours
to longitude degrees in the range -180–180; the second coordinate is
declination in degrees. Skyviewer converts longitude back to right ascension,
rotates each J2000 vector to the equator of the requested date, and then uses
Astronomy Engine 2.1.19 to calculate geometric local altitude and azimuth.

`SkyObject.ra` is right ascension of date in sidereal hours. Declination,
altitude, and azimuth are degrees. Azimuth starts at north and increases toward
the east. Geographic longitude is degrees east of Greenwich. The projection's
`fov` is its horizontal field of view in degrees.

Solar-system positions, parallax, aberration, and visual magnitudes are
calculated by [Astronomy Engine](https://github.com/cosinekitty/astronomy),
version 2.1.19. Atmospheric refraction is intentionally omitted so positions
remain geometric and continuous below the horizon.

## License and attribution

D3 Celestial is distributed under the BSD 3-Clause License. The upstream
license applies to the redistributed catalog files:

> Copyright (c) 2015, Olaf Frohn
>
> All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice,
>    this list of conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice,
>    this list of conditions and the following disclaimer in the documentation
>    and/or other materials provided with the distribution.
> 3. Neither the name of the copyright holder nor the names of its contributors
>    may be used to endorse or promote products derived from this software without
>    specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
> AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
> DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
> FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
> DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
> SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
> CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
> OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
> OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

The canonical license is retained at
[`d3-celestial/LICENSE`](https://github.com/ofrohn/d3-celestial/blob/7e720a3de062059d4c5400a379146a601d9010e0/LICENSE).
Astronomy Engine is MIT-licensed; see its
[`LICENSE`](https://github.com/cosinekitty/astronomy/blob/master/LICENSE).

## Browser subset

`npm run catalog` deterministically regenerates `src/data/catalog.json` from the
unchanged pinned source files. It removes unused star metadata and unused name
fields; coordinates and magnitudes retain their original precision. Original
files remain in the repository for auditing and reproducibility. Only the subset
is imported into the client bundle.

## Object information

The compact catalog also retains B−V color index where provided, plus proper-name,
Bayer, Flamsteed, and Hipparcos aliases. Search normalizes Greek designations,
accents, spacing, and punctuation. Solar-system distances are topocentric distances
from Astronomy Engine, in astronomical units (Moon also displayed in kilometres).
Stellar distances and spectral classes are not in this subset and are not invented;
star information links to SIMBAD by Hipparcos identifier. Planet information links
to NASA. These external references open only when selected by the user.
