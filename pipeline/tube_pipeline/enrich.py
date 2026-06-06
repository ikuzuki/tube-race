"""Enrich graph stations with trivia/stats from Wikidata and Wikipedia.

For every station already present in ``graph.json`` this module produces a
best-effort :class:`~tube_pipeline.models.StationInfo`: opening year (with a
network rank), an approximate daily traffic figure (with a rank), a short
sourced fun fact, and a link to the Wikipedia article. Every field is optional
-- only what could be resolved from open data is emitted.

Pipeline
--------
1. Query Wikidata (SPARQL) for London Underground stations, returning label,
   coordinates, opening date, annual patronage, and the English Wikipedia
   article title.
2. Match each Wikidata candidate to a graph station by coordinate proximity
   (haversine, nearest within ~400 m), falling back to a normalised-name
   match.
3. Fetch a one-line fun fact per matched station from the Wikipedia REST
   summary endpoint (polite: descriptive User-Agent, per-request delay).
4. Convert annual patronage to a daily figure, then rank stations by opening
   year (1 = oldest) and daily traffic (1 = busiest).

Network access is confined to :class:`WikidataClient` and
:class:`WikipediaClient`; :func:`enrich_stations` takes them as arguments so it
can be driven against mocked HTTP in tests.

See ``SPEC.md`` and ``web/src/lib/stationInfo.ts`` for the output contract.
"""

from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass
from typing import Any

import httpx

from tube_pipeline.models import (
    StationInfo,
    StationInfoCounts,
    StationInfoFile,
)

WIKIDATA_SPARQL_URL: str = "https://query.wikidata.org/sparql"
"""Wikidata SPARQL query-service endpoint."""

WIKIPEDIA_SUMMARY_URL: str = "https://en.wikipedia.org/api/rest_v1/page/summary"
"""Base URL of the Wikipedia REST page-summary endpoint."""

USER_AGENT: str = (
    "TubeRacePipeline/0.1 (https://github.com/tube-race; station trivia enrichment) httpx"
)
"""Descriptive User-Agent sent to both Wikimedia services (their policy asks for one)."""

DEFAULT_TIMEOUT: float = 60.0
"""Default per-request timeout in seconds (SPARQL can be slow)."""

DEFAULT_MATCH_RADIUS_M: float = 400.0
"""Maximum great-circle distance (metres) for a coordinate match."""

DEFAULT_WIKI_DELAY_S: float = 0.1
"""Polite delay between Wikipedia summary requests (the ~272 per-station calls)."""

SPARQL_MAX_RETRIES: int = 4
"""Attempts for the SPARQL query before giving up on a throttled endpoint."""

SPARQL_MAX_BACKOFF_S: float = 90.0
"""Cap on how long to honour a ``Retry-After`` between SPARQL attempts."""

_RETRYABLE_STATUS: frozenset[int] = frozenset({429, 500, 502, 503, 504})
"""HTTP statuses worth retrying the SPARQL query for (throttling/transient)."""

_EARTH_RADIUS_M: float = 6_371_000.0
"""Mean Earth radius in metres, for the haversine distance."""

# The Wikidata SPARQL query. A station qualifies if it is served by / has as a
# connecting line (P81) a line that is part of (P361, transitively) the London
# Underground (Q20075). The connecting-line-to-network relationship is the
# distinctive, reliable signal; an explicit station-class constraint is
# deliberately avoided because tube stations are typed inconsistently. The
# qualifying signal is a UNION of three cheap, direct (no property-path closure)
# arms -- a station counts if any of:
#   1. it is a direct instance of a London Underground station (Q14562709);
#   2. its transport network (P16) is the London Underground (Q20075) -- this
#      catches multi-modal interchanges (e.g. Stratford) typed only as railway
#      stations;
#   3. it has a connecting line (P81) whose transport network (P16) is the
#      London Underground (Q20075).
# Direct triples are used throughout: subclass-chain paths over a UNION are
# expensive enough that WDQS rejects the query with HTTP 429. (Earlier dead
# ends came from wrong QIDs and from the line->network link being P16, not
# P361.) Coordinates (P625) are required; opening date (P1619), patronage
# (P3872) and the enwiki article are optional. Note P3872 coverage for tube
# stations is sparse, so daily-traffic output is partial by design.
SPARQL_QUERY: str = """
SELECT DISTINCT ?station ?stationLabel ?coord ?opened ?patronage ?article WHERE {
  { ?station wdt:P31 wd:Q14562709 . }
  UNION
  { ?station wdt:P16 wd:Q20075 . }
  UNION
  { ?station wdt:P81 ?line . ?line wdt:P16 wd:Q20075 . }
  ?station wdt:P625 ?coord .
  OPTIONAL { ?station wdt:P1619 ?opened . }
  OPTIONAL { ?station wdt:P3872 ?patronage . }
  OPTIONAL {
    ?article schema:about ?station ;
             schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""
"""SPARQL used to pull London Underground station candidates from Wikidata."""

_WKT_POINT_RE: re.Pattern[str] = re.compile(r"Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)")
"""Matches a WKT ``Point(lon lat)`` literal as returned by Wikidata P625."""

_STATION_SUFFIX_RE: re.Pattern[str] = re.compile(
    r"\s*\(.*?\)|\s*(?:underground|tube|dlr|rail|railway)?\s*stations?\b|-underground\b",
    re.IGNORECASE,
)
"""Strips parentheticals and ``... [underground] station`` suffixes for name matching."""

_TITLE_SUFFIX_RE: re.Pattern[str] = re.compile(
    r"\s*\([^)]*\)\s*$|[\s-]*(?:underground|tube)?\s*station\s*$|-underground\s*$",
    re.IGNORECASE,
)
"""End-anchored strip for building a fallback Wikipedia title.

Unlike :data:`_STATION_SUFFIX_RE`, this removes only a trailing parenthetical or
``... [underground] station`` suffix, so an internal ``Station`` (as in
``Battersea Power Station``) is preserved in the article title.
"""


@dataclass(frozen=True)
class WikidataStation:
    """A single London Underground station candidate from Wikidata.

    Parameters
    ----------
    qid : str
        Wikidata entity id, e.g. ``"Q1234"``.
    name : str
        English label.
    lat, lon : float
        WGS84 coordinates from P625.
    opened_year : int or None
        Year parsed from the opening date (P1619), if present.
    annual_patronage : float or None
        Annual passenger usage (P3872), if present.
    article_title : str or None
        English Wikipedia article title (from the sitelink URL), if present.
    """

    qid: str
    name: str
    lat: float
    lon: float
    opened_year: int | None
    annual_patronage: float | None
    article_title: str | None


@dataclass(frozen=True)
class GraphStation:
    """The subset of a graph station needed for enrichment.

    Parameters
    ----------
    id : str
        Graph station id (output key).
    name : str
        Display name from the graph.
    lat, lon : float
        WGS84 coordinates from the graph.
    """

    id: str
    name: str
    lat: float
    lon: float


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in metres.

    Parameters
    ----------
    lat1, lon1 : float
        First point in decimal degrees.
    lat2, lon2 : float
        Second point in decimal degrees.

    Returns
    -------
    float
        Distance in metres.
    """
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))


def normalise_name(name: str) -> str:
    """Normalise a station name for fallback matching.

    Lowercases, strips ``... station``/``... underground station`` suffixes and
    parentheticals, expands ``&`` to ``and`` and ``st``/``st.`` to ``saint``,
    drops apostrophes and other punctuation, and collapses whitespace.

    Parameters
    ----------
    name : str
        Raw station name from either source.

    Returns
    -------
    str
        A normalised key suitable for equality comparison.
    """
    text = name.lower()
    text = _STATION_SUFFIX_RE.sub(" ", text)
    text = text.replace("&", " and ")
    text = text.replace("'", "").replace("’", "")
    # Expand "st"/"st." as a standalone word to "saint" (St Paul's -> saint pauls).
    text = re.sub(r"\bst\.?\b", "saint", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def parse_wkt_point(literal: str) -> tuple[float, float] | None:
    """Parse a Wikidata ``Point(lon lat)`` WKT literal.

    Parameters
    ----------
    literal : str
        The coordinate value string, e.g. ``"Point(-0.1437 51.4965)"``.

    Returns
    -------
    tuple of (float, float) or None
        ``(lat, lon)`` on success, ``None`` if the literal does not parse.
    """
    match = _WKT_POINT_RE.search(literal)
    if match is None:
        return None
    lon = float(match.group(1))
    lat = float(match.group(2))
    return lat, lon


def parse_opened_year(literal: str) -> int | None:
    """Extract a four-digit year from a Wikidata date literal.

    Wikidata dates are ISO-ish, optionally signed and zero-padded, e.g.
    ``"1868-12-24T00:00:00Z"`` or ``"+1863-01-01T00:00:00Z"``. Only the leading
    year is needed.

    Parameters
    ----------
    literal : str
        The opening-date value string.

    Returns
    -------
    int or None
        The year, or ``None`` if no plausible year is found.
    """
    match = re.match(r"[+-]?(\d{1,4})-", literal)
    if match is None:
        return None
    year = int(match.group(1))
    # Guard against year 0 / obviously bad values; the tube is 19th century on.
    if 1800 <= year <= 2100:
        return year
    return None


def article_title_from_url(url: str) -> str | None:
    """Recover a Wikipedia article title from its sitelink URL.

    Parameters
    ----------
    url : str
        A URL such as ``"https://en.wikipedia.org/wiki/Oval_tube_station"``.

    Returns
    -------
    str or None
        The decoded title (``"Oval tube station"``), or ``None`` if the URL has
        no ``/wiki/`` path segment.
    """
    marker = "/wiki/"
    idx = url.find(marker)
    if idx == -1:
        return None
    from urllib.parse import unquote

    slug = url[idx + len(marker) :]
    if not slug:
        return None
    return unquote(slug).replace("_", " ")


_ABBREVIATIONS: frozenset[str] = frozenset(
    {"st", "mt", "mtn", "ave", "rd", "no", "vol", "etc", "dr", "jr", "sr", "co"}
)
"""Lowercased tokens whose trailing period does not end a sentence (e.g. ``St.``)."""

_MIN_SENTENCE_LEN: int = 25
"""Below this length a period-break is treated as spurious (an abbreviation)."""


def first_sentence(extract: str, max_len: int = 220) -> str | None:
    """Trim a Wikipedia ``extract`` to a single punchy sentence.

    Returns the text up to the first genuine sentence-ending period. A period is
    not treated as a sentence end when it follows a known abbreviation (``St.``,
    ``Mt.``, ...) or when the fragment so far is implausibly short -- this avoids
    truncating "St. John's Wood is a station." to "St.". The result is hard-
    capped at ``max_len``.

    Parameters
    ----------
    extract : str
        The ``extract`` field from a Wikipedia summary.
    max_len : int, optional
        Maximum length of the returned string before truncation.

    Returns
    -------
    str or None
        A trimmed sentence, or ``None`` if the extract is empty.
    """
    text = extract.strip()
    if not text:
        return None

    sentence = text  # fall back to the whole extract if no clean break is found
    for match in re.finditer(r"\.\s", text):
        end = match.start()
        candidate = text[:end]
        # Reject breaks that are too short to be a real sentence...
        if len(candidate) < _MIN_SENTENCE_LEN:
            continue
        # ...or that follow a known abbreviation (the token before the period).
        last_token = re.split(r"[\s(]", candidate)[-1].lower()
        if last_token in _ABBREVIATIONS:
            continue
        sentence = text[: end + 1]
        break

    sentence = sentence.strip()
    if len(sentence) > max_len:
        sentence = sentence[: max_len - 1].rstrip() + "…"
    return sentence or None


class WikidataClient:
    """Minimal client for the Wikidata SPARQL endpoint.

    Parameters
    ----------
    endpoint : str, optional
        SPARQL endpoint URL. Defaults to :data:`WIKIDATA_SPARQL_URL`.
    timeout : float, optional
        Per-request timeout in seconds. Defaults to :data:`DEFAULT_TIMEOUT`.
    client : httpx.Client or None, optional
        An existing client to use (not closed by this object). When ``None`` a
        client carrying the descriptive User-Agent is created internally.
    """

    def __init__(
        self,
        endpoint: str = WIKIDATA_SPARQL_URL,
        timeout: float = DEFAULT_TIMEOUT,
        client: httpx.Client | None = None,
    ) -> None:
        self.endpoint = endpoint
        self._owns_client = client is None
        self._client = client if client is not None else _new_http_client(timeout)

    def __enter__(self) -> WikidataClient:
        """Enter the runtime context and return this client.

        Returns
        -------
        WikidataClient
            This client instance.
        """
        return self

    def __exit__(self, *exc: object) -> None:
        """Exit the runtime context, closing an internally owned client."""
        self.close()

    def close(self) -> None:
        """Close the underlying HTTP client if this object created it."""
        if self._owns_client:
            self._client.close()

    def fetch_stations(self, query: str = SPARQL_QUERY) -> list[WikidataStation]:
        """Run the SPARQL query and parse station candidates.

        One Wikidata entity can appear in several rows (multiple patronage
        statements, for example); rows are folded so each ``qid`` yields one
        candidate, preferring the largest patronage value seen.

        Parameters
        ----------
        query : str, optional
            SPARQL query string. Defaults to :data:`SPARQL_QUERY`.

        Throttled or transient responses (429/5xx) are retried up to
        :data:`SPARQL_MAX_RETRIES` times, honouring ``Retry-After`` up to
        :data:`SPARQL_MAX_BACKOFF_S`. A persistent error raises so the failure
        is loud rather than silently yielding an empty artefact.

        Returns
        -------
        list of WikidataStation
            All candidates that carried parseable coordinates.

        Raises
        ------
        httpx.HTTPStatusError
            If the SPARQL service keeps returning an error status.
        """
        last_response: httpx.Response | None = None
        for attempt in range(SPARQL_MAX_RETRIES):
            response = self._client.get(
                self.endpoint,
                params={"query": query, "format": "json"},
                headers={"Accept": "application/sparql-results+json"},
            )
            if response.status_code == 200:
                payload: dict[str, Any] = response.json()
                return _parse_sparql_results(payload)
            last_response = response
            if response.status_code not in _RETRYABLE_STATUS:
                break
            if attempt == SPARQL_MAX_RETRIES - 1:
                break
            wait_s = _retry_after_seconds(response, default=2.0 * (attempt + 1))
            if wait_s > SPARQL_MAX_BACKOFF_S:
                # The endpoint wants longer than we will wait; fail loud now.
                break
            time.sleep(wait_s)
        assert last_response is not None  # noqa: S101 - loop always sets it
        last_response.raise_for_status()
        # raise_for_status raises for any non-2xx; this line is unreachable for
        # error statuses but satisfies the type checker for the 2xx-but-unhandled
        # edge (which the loop already returns for).
        payload = last_response.json()  # pragma: no cover
        return _parse_sparql_results(payload)  # pragma: no cover


class WikipediaClient:
    """Minimal client for the Wikipedia REST page-summary endpoint.

    Parameters
    ----------
    base_url : str, optional
        Summary endpoint base. Defaults to :data:`WIKIPEDIA_SUMMARY_URL`.
    timeout : float, optional
        Per-request timeout in seconds. Defaults to ``30.0``.
    delay_s : float, optional
        Seconds to sleep after each request, to stay polite over the ~272
        per-station calls. Defaults to :data:`DEFAULT_WIKI_DELAY_S`. Set to
        ``0`` in tests.
    client : httpx.Client or None, optional
        An existing client to use (not closed by this object). When ``None`` a
        client carrying the descriptive User-Agent is created internally.
    """

    def __init__(
        self,
        base_url: str = WIKIPEDIA_SUMMARY_URL,
        timeout: float = 30.0,
        delay_s: float = DEFAULT_WIKI_DELAY_S,
        client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.delay_s = delay_s
        self._owns_client = client is None
        self._client = client if client is not None else _new_http_client(timeout)

    def __enter__(self) -> WikipediaClient:
        """Enter the runtime context and return this client.

        Returns
        -------
        WikipediaClient
            This client instance.
        """
        return self

    def __exit__(self, *exc: object) -> None:
        """Exit the runtime context, closing an internally owned client."""
        self.close()

    def close(self) -> None:
        """Close the underlying HTTP client if this object created it."""
        if self._owns_client:
            self._client.close()

    def summary_extract(self, title: str) -> str | None:
        """Fetch the plain-text ``extract`` for an article title.

        A missing page (404) or any non-2xx status yields ``None`` rather than
        raising, so a single bad title never aborts the run.

        Parameters
        ----------
        title : str
            Article title, e.g. ``"Oval tube station"``. Spaces are encoded by
            httpx; the endpoint also accepts underscores.

        Returns
        -------
        str or None
            The ``extract`` text, or ``None`` if unavailable.
        """
        from urllib.parse import quote

        url = f"{self.base_url}/{quote(title.replace(' ', '_'), safe='')}"
        try:
            response = self._client.get(url)
        except httpx.HTTPError:
            return None
        finally:
            if self.delay_s > 0:
                time.sleep(self.delay_s)
        if response.status_code != 200:
            return None
        try:
            body: dict[str, Any] = response.json()
        except ValueError:
            return None
        extract = body.get("extract")
        return extract if isinstance(extract, str) and extract.strip() else None


def _new_http_client(timeout: float) -> httpx.Client:
    """Create an httpx client carrying the descriptive User-Agent.

    Parameters
    ----------
    timeout : float
        Per-request timeout in seconds.

    Returns
    -------
    httpx.Client
        A client that follows redirects and sends :data:`USER_AGENT`.
    """
    return httpx.Client(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )


def _retry_after_seconds(response: httpx.Response, default: float) -> float:
    """Read a ``Retry-After`` header as seconds, falling back to a default.

    Only the integer-seconds form is interpreted (the HTTP-date form is rare
    here and treated as the default).

    Parameters
    ----------
    response : httpx.Response
        The throttled response.
    default : float
        Seconds to use when the header is absent or not an integer.

    Returns
    -------
    float
        Seconds to wait before the next attempt.
    """
    raw = response.headers.get("retry-after")
    if raw is None:
        return default
    try:
        return float(int(raw.strip()))
    except (TypeError, ValueError):
        return default


def _parse_sparql_results(payload: dict[str, Any]) -> list[WikidataStation]:
    """Fold raw SPARQL JSON bindings into deduplicated station candidates.

    Parameters
    ----------
    payload : dict
        Decoded ``application/sparql-results+json`` body.

    Returns
    -------
    list of WikidataStation
        One candidate per Wikidata entity with parseable coordinates.
    """
    bindings = payload.get("results", {}).get("bindings", [])
    by_qid: dict[str, WikidataStation] = {}
    for row in bindings:
        coord_cell = row.get("coord", {}).get("value")
        station_uri = row.get("station", {}).get("value")
        if not coord_cell or not station_uri:
            continue
        coords = parse_wkt_point(coord_cell)
        if coords is None:
            continue
        qid = station_uri.rsplit("/", 1)[-1]
        lat, lon = coords

        opened_year: int | None = None
        if "opened" in row:
            opened_year = parse_opened_year(row["opened"].get("value", ""))

        patronage: float | None = None
        if "patronage" in row:
            try:
                patronage = float(row["patronage"].get("value", ""))
            except (TypeError, ValueError):
                patronage = None

        article_title: str | None = None
        if "article" in row:
            article_title = article_title_from_url(row["article"].get("value", ""))

        name = row.get("stationLabel", {}).get("value", qid)

        existing = by_qid.get(qid)
        if existing is None:
            by_qid[qid] = WikidataStation(
                qid=qid,
                name=name,
                lat=lat,
                lon=lon,
                opened_year=opened_year,
                annual_patronage=patronage,
                article_title=article_title,
            )
        else:
            by_qid[qid] = _merge_candidates(existing, opened_year, patronage, article_title)
    return list(by_qid.values())


def _merge_candidates(
    existing: WikidataStation,
    opened_year: int | None,
    patronage: float | None,
    article_title: str | None,
) -> WikidataStation:
    """Fold a repeated SPARQL row into an existing candidate.

    Keeps the earliest opening year, the largest patronage figure, and the
    first article title seen.

    Parameters
    ----------
    existing : WikidataStation
        The candidate accumulated so far.
    opened_year : int or None
        Opening year from the current row.
    patronage : float or None
        Patronage from the current row.
    article_title : str or None
        Article title from the current row.

    Returns
    -------
    WikidataStation
        The merged candidate.
    """
    merged_opened = existing.opened_year
    if opened_year is not None and (merged_opened is None or opened_year < merged_opened):
        merged_opened = opened_year

    merged_patronage = existing.annual_patronage
    if patronage is not None and (merged_patronage is None or patronage > merged_patronage):
        merged_patronage = patronage

    merged_article = existing.article_title or article_title

    return WikidataStation(
        qid=existing.qid,
        name=existing.name,
        lat=existing.lat,
        lon=existing.lon,
        opened_year=merged_opened,
        annual_patronage=merged_patronage,
        article_title=merged_article,
    )


def match_candidate(
    station: GraphStation,
    candidates: list[WikidataStation],
    name_index: dict[str, WikidataStation],
    radius_m: float = DEFAULT_MATCH_RADIUS_M,
) -> WikidataStation | None:
    """Match one graph station to its nearest Wikidata candidate.

    Coordinate proximity is tried first (nearest candidate within ``radius_m``),
    then a normalised-name lookup as a fallback.

    Parameters
    ----------
    station : GraphStation
        The graph station to match.
    candidates : list of WikidataStation
        All Wikidata candidates.
    name_index : dict of str to WikidataStation
        Candidates keyed by :func:`normalise_name` of their label (built once by
        the caller).
    radius_m : float, optional
        Maximum match distance in metres. Defaults to
        :data:`DEFAULT_MATCH_RADIUS_M`.

    Returns
    -------
    WikidataStation or None
        The matched candidate, or ``None`` if neither strategy finds one.
    """
    best: WikidataStation | None = None
    best_dist = radius_m
    for cand in candidates:
        dist = haversine_m(station.lat, station.lon, cand.lat, cand.lon)
        if dist <= best_dist:
            best = cand
            best_dist = dist
    if best is not None:
        return best
    return name_index.get(normalise_name(station.name))


def load_graph_stations(graph_path: str) -> list[GraphStation]:
    """Read the id/name/lat/lon of every station in a ``graph.json``.

    Parameters
    ----------
    graph_path : str
        Path to the graph artefact.

    Returns
    -------
    list of GraphStation
        One entry per station, in file order.
    """
    import json
    from pathlib import Path

    raw = json.loads(Path(graph_path).read_text(encoding="utf-8"))
    return [
        GraphStation(
            id=str(s["id"]),
            name=str(s["name"]),
            lat=float(s["lat"]),
            lon=float(s["lon"]),
        )
        for s in raw.get("stations", [])
    ]


def _assign_ranks(values: dict[str, int], *, descending: bool) -> dict[str, int]:
    """Rank station ids by an integer value, 1 = first.

    Ties share neither value adjustments nor gaps beyond standard competition
    behaviour: ids are ordered by value then id (stable) and assigned a strict
    1..N rank.

    Parameters
    ----------
    values : dict of str to int
        Station id to the value being ranked.
    descending : bool
        ``True`` ranks the largest value first (traffic); ``False`` ranks the
        smallest first (opening year).

    Returns
    -------
    dict of str to int
        Station id to its 1-based rank.
    """
    ordered = sorted(values.items(), key=lambda kv: (-kv[1] if descending else kv[1], kv[0]))
    return {station_id: rank for rank, (station_id, _) in enumerate(ordered, start=1)}


def build_station_infos(
    graph_stations: list[GraphStation],
    candidates: list[WikidataStation],
    wiki: WikipediaClient,
    radius_m: float = DEFAULT_MATCH_RADIUS_M,
) -> dict[str, StationInfo]:
    """Match, fetch fun facts, and assemble per-station info (pre-ranking).

    Parameters
    ----------
    graph_stations : list of GraphStation
        Stations to enrich.
    candidates : list of WikidataStation
        Wikidata candidates to match against.
    wiki : WikipediaClient
        Client used to fetch Wikipedia summaries for fun facts.
    radius_m : float, optional
        Coordinate match radius in metres.

    Returns
    -------
    dict of str to StationInfo
        One entry per graph station, keyed by graph id. Opened/traffic ranks are
        left unset here and filled by :func:`enrich_stations`.
    """
    name_index = _build_name_index(candidates)
    infos: dict[str, StationInfo] = {}
    for station in graph_stations:
        match = match_candidate(station, candidates, name_index, radius_m=radius_m)
        opened_year = match.opened_year if match else None
        daily_traffic = _daily_from_annual(match.annual_patronage) if match else None
        wiki_url, fun_fact = _resolve_article(station, match, wiki)
        # Constructed via model_validate with alias keys (matching the Edge /
        # TubeGraph convention in build_graph.py) so the aliased fields are set
        # without alias-named kwargs, keeping mypy happy without the pydantic
        # plugin.
        infos[station.id] = StationInfo.model_validate(
            {
                "name": station.name,
                "openedYear": opened_year,
                "dailyTraffic": daily_traffic,
                "funFact": fun_fact,
                "wikiUrl": wiki_url,
            }
        )
    return infos


def _build_name_index(candidates: list[WikidataStation]) -> dict[str, WikidataStation]:
    """Index candidates by normalised name for fallback matching.

    On a key collision the first candidate wins (Wikidata labels are
    near-unique for tube stations, so collisions are rare).

    Parameters
    ----------
    candidates : list of WikidataStation
        All Wikidata candidates.

    Returns
    -------
    dict of str to WikidataStation
        Normalised label to candidate.
    """
    index: dict[str, WikidataStation] = {}
    for cand in candidates:
        key = normalise_name(cand.name)
        if key and key not in index:
            index[key] = cand
    return index


def _daily_from_annual(annual: float | None) -> int | None:
    """Convert an annual patronage figure to a rounded daily figure.

    Parameters
    ----------
    annual : float or None
        Annual passenger usage.

    Returns
    -------
    int or None
        ``round(annual / 365)`` when positive, else ``None``.
    """
    if annual is None or annual <= 0:
        return None
    return round(annual / 365.0)


def _resolve_article(
    station: GraphStation,
    match: WikidataStation | None,
    wiki: WikipediaClient,
) -> tuple[str | None, str | None]:
    """Resolve the Wikipedia URL and fun fact for a station.

    Uses the matched article title when present, otherwise falls back to
    ``"{name} tube station"`` (with the graph's name stripped of its
    ``Underground Station`` suffix). The URL is only emitted when the summary
    fetch confirms the article exists.

    Parameters
    ----------
    station : GraphStation
        The graph station (used for the fallback title).
    match : WikidataStation or None
        The matched candidate, if any.
    wiki : WikipediaClient
        Client used to fetch the summary.

    Returns
    -------
    tuple of (str or None, str or None)
        ``(wiki_url, fun_fact)``. Either element may be ``None``.
    """
    title = match.article_title if match and match.article_title else None
    if title is None:
        bare = _TITLE_SUFFIX_RE.sub("", station.name).strip()
        title = f"{bare} tube station" if bare else None
    if title is None:
        return None, None

    extract = wiki.summary_extract(title)
    if extract is None:
        return None, None
    from urllib.parse import quote

    wiki_url = f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'), safe='')}"
    return wiki_url, first_sentence(extract)


def enrich_stations(
    graph_stations: list[GraphStation],
    wikidata: WikidataClient,
    wikipedia: WikipediaClient,
    generated_at: str,
    radius_m: float = DEFAULT_MATCH_RADIUS_M,
) -> StationInfoFile:
    """Produce the full station-info artefact for a set of graph stations.

    Fetches Wikidata candidates once, matches and enriches each station, then
    computes network-wide ranks (``openedRank`` 1 = oldest; ``dailyTrafficRank``
    1 = busiest) among the stations that have each stat.

    Parameters
    ----------
    graph_stations : list of GraphStation
        Stations to enrich (typically every station in ``graph.json``).
    wikidata : WikidataClient
        Client used for the single SPARQL query.
    wikipedia : WikipediaClient
        Client used for per-station summary fetches.
    generated_at : str
        ISO date written to the artefact's ``generatedAt`` field.
    radius_m : float, optional
        Coordinate match radius in metres.

    Returns
    -------
    StationInfoFile
        The assembled, ranked artefact.
    """
    candidates = wikidata.fetch_stations()
    infos = build_station_infos(graph_stations, candidates, wikipedia, radius_m=radius_m)

    opened_values = {
        sid: info.opened_year for sid, info in infos.items() if info.opened_year is not None
    }
    traffic_values = {
        sid: info.daily_traffic for sid, info in infos.items() if info.daily_traffic is not None
    }
    opened_ranks = _assign_ranks(opened_values, descending=False)
    traffic_ranks = _assign_ranks(traffic_values, descending=True)

    for sid, info in infos.items():
        if sid in opened_ranks:
            info.opened_rank = opened_ranks[sid]
        if sid in traffic_ranks:
            info.daily_traffic_rank = traffic_ranks[sid]

    # Constructed via model_validate with alias keys, matching the Edge /
    # TubeGraph convention in build_graph.py (the pydantic mypy plugin is not
    # enabled, so alias-named kwargs would not type-check).
    counts = StationInfoCounts.model_validate(
        {
            "total": len(graph_stations),
            "withOpened": len(opened_values),
            "withTraffic": len(traffic_values),
        }
    )
    return StationInfoFile.model_validate(
        {
            "version": "1.0",
            "generatedAt": generated_at,
            "counts": counts,
            "stations": infos,
        }
    )


def write_station_info(info_file: StationInfoFile, out_path: str) -> None:
    """Serialise a station-info artefact to JSON on disk.

    Emits camelCase keys (``by_alias=True``) and omits absent optional fields
    (``exclude_none=True``), pretty-printed with two-space indentation and a
    trailing newline. Parent directories are created if missing.

    Parameters
    ----------
    info_file : StationInfoFile
        The artefact to serialise.
    out_path : str
        Destination file path.
    """
    import json
    from pathlib import Path

    destination = Path(out_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = info_file.model_dump(by_alias=True, exclude_none=True)
    destination.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
