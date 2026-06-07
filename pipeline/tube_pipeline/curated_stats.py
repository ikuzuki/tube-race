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

CURATED_WIKI_URLS: dict[str, str] = {
    # Wikipedia article URLs for stations the Wikidata query did not match
    # (mostly Overground/rail). Resolved once against the live Wikipedia REST
    # API (canonical titles, redirects followed) and frozen here.
    "Acton Central": "https://en.wikipedia.org/wiki/Acton_Central_railway_station",
    "Barking Riverside": "https://en.wikipedia.org/wiki/Barking_Riverside_railway_station",
    "Brockley": "https://en.wikipedia.org/wiki/Brockley_railway_station",
    "Brondesbury Park": "https://en.wikipedia.org/wiki/Brondesbury_Park_railway_station",
    "Bruce Grove": "https://en.wikipedia.org/wiki/Bruce_Grove_railway_station",
    "Bush Hill Park": "https://en.wikipedia.org/wiki/Bush_Hill_Park_railway_station",
    "Caledonian Road & Barnsbury": "https://en.wikipedia.org/wiki/Caledonian_Road_&_Barnsbury_railway_station",
    "Cambridge Heath": "https://en.wikipedia.org/wiki/Cambridge_Heath_railway_station",
    "Cheshunt": "https://en.wikipedia.org/wiki/Cheshunt_railway_station",
    "Chingford": "https://en.wikipedia.org/wiki/Chingford_railway_station",
    "Clapton": "https://en.wikipedia.org/wiki/Clapton_railway_station",
    "Crouch Hill": "https://en.wikipedia.org/wiki/Crouch_Hill_railway_station",
    "Cutty Sark": "https://en.wikipedia.org/wiki/Cutty_Sark_for_Maritime_Greenwich_DLR_station",
    "Denmark Hill": "https://en.wikipedia.org/wiki/Denmark_Hill_railway_station",
    "Edmonton Green": "https://en.wikipedia.org/wiki/Edmonton_Green_railway_station",
    "Emerson Park": "https://en.wikipedia.org/wiki/Emerson_Park_railway_station",
    "Enfield Town": "https://en.wikipedia.org/wiki/Enfield_Town_railway_station",
    "Gospel Oak": "https://en.wikipedia.org/wiki/Gospel_Oak_railway_station",
    "Hackney Downs": "https://en.wikipedia.org/wiki/Hackney_Downs_railway_station",
    "Hackney Wick": "https://en.wikipedia.org/wiki/Hackney_Wick_railway_station",
    "Hampstead Heath": "https://en.wikipedia.org/wiki/Hampstead_Heath_railway_station",
    "Harringay Green Lanes": "https://en.wikipedia.org/wiki/Harringay_Green_Lanes_railway_station",
    "Highams Park": "https://en.wikipedia.org/wiki/Highams_Park_railway_station",
    "Homerton": "https://en.wikipedia.org/wiki/Homerton_railway_station",
    "Imperial Wharf": "https://en.wikipedia.org/wiki/Imperial_Wharf_railway_station",
    "Kensal Rise": "https://en.wikipedia.org/wiki/Kensal_Rise_railway_station",
    "Leyton Midland Road": "https://en.wikipedia.org/wiki/Leyton_Midland_Road_railway_station",
    "Leytonstone High Road": "https://en.wikipedia.org/wiki/Leytonstone_High_Road_railway_station",
    "London Fields": "https://en.wikipedia.org/wiki/London_Fields_railway_station",
    "Peckham Rye": "https://en.wikipedia.org/wiki/Peckham_Rye_railway_station",
    "Queens Road Peckham": "https://en.wikipedia.org/wiki/Queens_Road_Peckham_railway_station",
    "Reading": "https://en.wikipedia.org/wiki/Reading_railway_station",
    "Rectory Road": "https://en.wikipedia.org/wiki/Rectory_Road_railway_station",
    "Silver Street": "https://en.wikipedia.org/wiki/Silver_Street_railway_station",
    "South Tottenham": "https://en.wikipedia.org/wiki/South_Tottenham_railway_station",
    "Southbury": "https://en.wikipedia.org/wiki/Southbury_railway_station",
    "St James Street": "https://en.wikipedia.org/wiki/St._James_Street_railway_station",
    "Stamford Hill": "https://en.wikipedia.org/wiki/Stamford_Hill_railway_station",
    "Star Lane": "https://en.wikipedia.org/wiki/Star_Lane_DLR_station",
    "Stoke Newington": "https://en.wikipedia.org/wiki/Stoke_Newington_railway_station",
    "Stratford International": "https://en.wikipedia.org/wiki/Stratford_International_station",
    "Theobalds Grove": "https://en.wikipedia.org/wiki/Theobalds_Grove_railway_station",
    "Turkey Street": "https://en.wikipedia.org/wiki/Turkey_Street_railway_station",
    "Upper Holloway": "https://en.wikipedia.org/wiki/Upper_Holloway_railway_station",
    "Walthamstow Queens Road": "https://en.wikipedia.org/wiki/Walthamstow_Queen's_Road_railway_station",
    "Wandsworth Road": "https://en.wikipedia.org/wiki/Wandsworth_Road_railway_station",
    "White Hart Lane": "https://en.wikipedia.org/wiki/White_Hart_Lane_railway_station",
    "Wood Street": "https://en.wikipedia.org/wiki/Wood_Street_railway_station",
}
"""Cleaned display name -> Wikipedia URL, filling the Wikidata gaps."""
