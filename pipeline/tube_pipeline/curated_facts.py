"""Hand-curated fun facts for the most recognisable / interesting stations.

These are authored once (here, in version control) and take priority over the
auto-derived Wikipedia facts in the enrichment step — so the headline stations
read well even where a Wikipedia intro is thin. Everything not listed falls back
to the heuristic fact. Keyed by display name; matched case/punctuation-insensitively
via ``normalise_name`` in the enrichment step.

Facts are kept to one punchy, accurate sentence, drawn from well-established
London Underground history/geography (records cross-checked against TfL / the
London Transport Museum / Wikipedia). Where a claim is folklore rather than
settled fact it is hedged ("reputedly", "often credited").
"""

CURATED_FACTS: dict[str, str] = {
    # --- Network records ---
    "Hampstead": "At 58.5 m below the surface, Hampstead is the deepest station on the Underground.",
    "Amersham": "Amersham is the highest station above sea level (about 150 m) and tied for the furthest from central London.",
    "Angel": "Angel has the longest escalator on the network — a 60 m climb.",
    "Earl's Court": "Earl's Court got the Underground's first escalators in 1911, and a full-size TARDIS police box still stands outside.",
    "Baker Street": "Baker Street has more platforms than any other Tube station (ten) and was part of the world's first underground railway in 1863.",
    "Roding Valley": "Roding Valley is the least-used station on the entire Underground.",
    "Greenford": "Greenford had the Underground's last wooden escalator, since replaced by its only inclined lift.",
    "Morden": "Morden is the southernmost station on the network, in a striking 1926 Charles Holden building.",
    "Chesham": "Chesham is the westernmost station on the Underground, on a lonely single-track Metropolitan branch.",
    # --- Named after a landmark ---
    "Oval": "Oval is named after the adjacent cricket ground — the world's first international cricket venue.",
    "Bank": "Bank is named after the Bank of England, which it sits beneath.",
    "Monument": "Monument is named after Wren's column commemorating the Great Fire of London, just outside.",
    "Tower Hill": "Tower Hill is the stop for the Tower of London and Tower Bridge.",
    "St. Paul's": "St Paul's, beside Wren's cathedral, was renamed from 'Post Office' in 1937.",
    "Temple": "Temple takes its name from the medieval Temple and the Inns of Court above it.",
    "Westminster": "Westminster's deep station box sits beneath Portcullis House, right by Parliament and Big Ben.",
    "Charing Cross": "Charing Cross marks the point from which all distances to London are traditionally measured.",
    "Wembley Park": "Wembley Park is the stop for Wembley Stadium.",
    "North Greenwich": "North Greenwich serves the O2 Arena, the former Millennium Dome.",
    "London Bridge": "London Bridge is overlooked by the Shard, western Europe's tallest building.",
    "Wimbledon": "Wimbledon, a District line terminus, is home to the tennis championships.",
    "Stratford": "Stratford was the gateway to the 2012 Olympic Park.",
    "Pimlico": "Pimlico is the only Victoria line station with no interchange, and the closest stop to Tate Britain.",
    # --- Architecture & design ---
    "Southgate": "Southgate's flying-saucer station building, by Charles Holden, is so admired it is Grade II* listed.",
    "Gants Hill": "Gants Hill's grand barrel-vaulted concourse was modelled on the Moscow Metro.",
    "Arnos Grove": "Arnos Grove's circular Holden ticket hall is one of the most celebrated buildings on the Underground.",
    "Sudbury Town": "Sudbury Town set the template for Charles Holden's 1930s 'brick box with a concrete lid' stations.",
    "Cockfosters": "Cockfosters, the Piccadilly line's northern terminus, is a soaring Charles Holden concrete hall.",
    "Canary Wharf": "Canary Wharf's cavernous Jubilee line station was designed by Norman Foster.",
    "Tottenham Court Road": "Tottenham Court Road is lined with Eduardo Paolozzi's vivid 1980s mosaics.",
    "Piccadilly Circus": "Piccadilly Circus has no surface building at all — its ticket hall is entirely underground, beneath Eros.",
    # --- History & wartime ---
    "Maida Vale": "Maida Vale opened in 1915 staffed entirely by women, while the men were away at war.",
    "Aldgate": "Aldgate is reputedly built over a mass grave from the Great Plague of 1665.",
    "Clapham South": "A WWII deep-level shelter beneath Clapham South later housed Windrush arrivals in 1948.",
    "Goodge Street": "A WWII deep-level shelter under Goodge Street served as a military headquarters.",
    "Stockwell": "A WWII deep-level shelter sits beneath Stockwell, its surface rotunda now a war memorial.",
    "Wanstead": "Wanstead's unopened Central line tunnels hid a secret aircraft-parts factory during WWII.",
    "Liverpool Street": "Crossrail digging at Liverpool Street uncovered the Bedlam burial ground and thousands of skeletons.",
    # --- Quirks & culture ---
    "Mornington Crescent": "Mornington Crescent lends its name to the surreal game on BBC radio's I'm Sorry I Haven't a Clue.",
    "Covent Garden": "Covent Garden to Leicester Square is the network's shortest hop — about 260 m, and famously not worth the fare.",
    "Leicester Square": "Leicester Square is the West End's cinema heart and the home of film premieres.",
    "Vauxhall": "Vauxhall is often credited as the origin of the Russian word for a railway station, 'vokzal'.",
    "Kennington": "Kennington has a circular tunnel 'loop' where Northern line trains turn around underground.",
    "East Finchley": "East Finchley is watched over by 'The Archer', a statue aiming his bow straight down the line towards the City.",
    "Highgate": "Highgate's abandoned surface platforms are now a wooded nature reserve and bat roost.",
    "Clapham Common": "Clapham Common keeps one of the Underground's last narrow Victorian island platforms.",
    "Old Street": "Old Street's roundabout was the heart of London's 'Silicon Roundabout' tech scene.",
    "Camden Town": "Camden Town sits above the famous markets and is the most complex track junction on the network.",
    "Edgware Road": "London has two separate Edgware Road stations, almost side by side but never connected.",
    "Brixton": "Brixton is the southern end of the Victoria line, and one of its busiest stops.",
    "Walthamstow Central": "Walthamstow Central, the Victoria line's northern terminus, is near the William Morris Gallery.",
    "Epping": "Epping is the Central line's northern terminus; trains once carried on to Ongar.",
    "King's Cross St. Pancras": "King's Cross St Pancras is the Underground's busiest interchange (six lines), and Platform 9¾ is next door.",
    "Waterloo": "Waterloo is served by the Waterloo & City line, the little shuttle Londoners nickname 'the Drain'.",
}
"""Display-name -> one-sentence fun fact. Matched via ``normalise_name``."""
