"""Curated opening-year and daily-traffic overrides for stations the automated
sources miss.

The Wikidata SPARQL query and the TfL Annual Station Counts XLSX cover the
Underground well, but the 2025 network additions (Overground, DLR, Elizabeth
line) leave gaps: opening years missing for most non-tube stations, and daily
traffic missing wherever the tube-only counts file has no row. The values here
fill those gaps so every station card can show its stats.

Opening years are the year the station first opened to passengers (matching the
convention Wikidata uses for the tube stations), from railway history sources.
Daily-traffic figures are informed estimates of average daily entries+exits,
sense-checked against TfL and ORR usage publications; they are deliberately
round numbers, good enough for the "Nth busiest" rank without pretending to be
gateline-precise.

Keys are CLEANED display names (see ``enrich.clean_station_name``) and are
matched after ``normalise_name``, mirroring ``curated_facts.CURATED_FACTS``.
Overrides FILL missing values only; a value already resolved from an automated
source always wins. Applied by ``enrich.apply_curated_stats`` (CLI:
``apply-stats``), which recomputes both ranks over the full coverage so the
"Nth oldest / Nth busiest" claims stay consistent.
"""

from __future__ import annotations

CURATED_OPENED_YEARS: dict[str, int] = {
    # The one tube-served gap: Wikidata carries no usable opening date for the
    # merged Bank node. The Waterloo & City platforms opened first.
    "Bank": 1898,
    # DLR. Branch openings: original network 1987, Beckton branch 1994,
    # Lewisham extension 1999, City Airport branch 2005, Stratford
    # International branch 2011, plus infills.
    "All Saints": 1987,
    "Crossharbour": 1987,
    "Devons Road": 1987,
    "Island Gardens": 1987,
    "Mudchute": 1987,
    "South Quay": 1987,
    "Westferry": 1987,
    "Beckton": 1994,
    "Beckton Park": 1994,
    "Blackwall": 1994,
    "Cyprus": 1994,
    "East India": 1994,
    "Gallions Reach": 1994,
    "Prince Regent": 1994,
    "Royal Albert": 1994,
    "Royal Victoria": 1994,
    "Pudding Mill Lane": 1996,
    "Cutty Sark": 1999,
    "Deptford Bridge": 1999,
    "Elverson Road": 1999,
    "King George V": 2005,
    "London City Airport": 2005,
    "Pontoon Dock": 2005,
    "West Silvertown": 2005,
    "Langdon Park": 2007,
    "Star Lane": 2011,
    "Stratford International": 2011,
    # DLR stations on old railway alignments keep their original opening.
    "Greenwich": 1838,
    "Lewisham": 1849,
    "Limehouse": 1840,
    # Elizabeth line.
    "Reading": 1840,
    # Overground (mostly Victorian suburban railways).
    "Acton Central": 1853,
    "Barking Riverside": 2022,
    "Brockley": 1871,
    "Brondesbury Park": 1908,
    "Bruce Grove": 1872,
    "Bush Hill Park": 1880,
    "Bushey": 1841,
    "Caledonian Road & Barnsbury": 1852,
    "Cambridge Heath": 1872,
    "Carpenders Park": 1914,
    "Cheshunt": 1842,
    "Chingford": 1873,
    "Clapham Junction": 1863,
    "Clapton": 1872,
    "Crouch Hill": 1868,
    "Denmark Hill": 1865,
    "Edmonton Green": 1872,
    "Emerson Park": 1909,
    "Enfield Town": 1849,
    "Gospel Oak": 1860,
    "Hackney Central": 1850,
    "Hackney Downs": 1872,
    "Hackney Wick": 1980,
    "Hampstead Heath": 1860,
    "Harringay Green Lanes": 1880,
    "Headstone Lane": 1913,
    "Highams Park": 1873,
    "Homerton": 1868,
    "Imperial Wharf": 2009,
    "Kensal Rise": 1873,
    "Leyton Midland Road": 1894,
    "Leytonstone High Road": 1894,
    "London Fields": 1872,
    "Peckham Rye": 1865,
    "Queens Road Peckham": 1866,
    "Rectory Road": 1872,
    "Silver Street": 1872,
    "South Acton": 1880,
    "Southbury": 1891,
    "St James Street": 1870,
    "Stamford Hill": 1872,
    "Stoke Newington": 1872,
    "Theobalds Grove": 1891,
    "Turkey Street": 1891,
    "Upper Holloway": 1868,
    "Wandsworth Road": 1863,
    "Wapping": 1869,
    "Watford High Street": 1862,
    "Watford Junction": 1837,
    "West Croydon": 1839,
    "White Hart Lane": 1872,
    "Wood Street": 1873,
}
"""Opening year for stations the Wikidata query leaves blank."""

CURATED_YEAR_CORRECTIONS: dict[str, int] = {
    # Known-bad Wikidata opening dates, applied even when a source value
    # exists. The original DLR network (including Poplar and West India Quay)
    # opened in 1987; the Woolwich Arsenal DLR extension in 2009; Dalston
    # Kingsland opened in 1983 on the North London Line.
    "Poplar": 1987,
    "West India Quay": 1987,
    "Woolwich Arsenal": 2009,
    "Dalston Kingsland": 1983,
}
"""Opening-year corrections that OVERRIDE a wrong automated source value."""

CURATED_DAILY_TRAFFIC: dict[str, int] = {
    # The TfL Annual Station Counts file now supplies real entries+exits for
    # every modelled mode (LU/LO/DLR/Elizabeth), so the only remaining gap is
    # Kentish Town, which read "---" in 2023 while shut for refurbishment. This
    # is its informed pre-closure daily level; everything else is real data.
    "Kentish Town": 16_000,
}
"""Daily-traffic fill for the one station the counts file cannot supply."""
