"""Thin HTTP client for the TfL Open Data API.

Wraps the single TfL endpoint the pipeline needs -- the ordered route sequence
for a line and direction -- behind a small, typed client. Network access lives
here so the graph-building logic in :mod:`tube_pipeline.build_graph` stays pure
and easy to test with mocked HTTP.

See ``SPEC.md`` ("TfL data source") for the data contract.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

TUBE_LINE_IDS: list[str] = [
    "bakerloo",
    "central",
    "circle",
    "district",
    "hammersmith-city",
    "jubilee",
    "metropolitan",
    "northern",
    "piccadilly",
    "victoria",
    "waterloo-city",
]
"""The 11 London Underground line ids."""

OVERGROUND_LINE_IDS: list[str] = [
    "liberty",
    "lioness",
    "mildmay",
    "suffragette",
    "weaver",
    "windrush",
]
"""The six London Overground lines (named in the 2024 rebrand)."""

OTHER_LINE_IDS: list[str] = [
    "dlr",
    "elizabeth",
]
"""Non-tube, non-Overground rapid-transit lines the game models (DLR, Elizabeth)."""

MODELLED_LINE_IDS: list[str] = [*TUBE_LINE_IDS, *OVERGROUND_LINE_IDS, *OTHER_LINE_IDS]
"""Every line id the graph models: 11 tube + 6 Overground + DLR + Elizabeth = 19.

Stops are merged into single station nodes across modes at shared interchanges
(see :mod:`tube_pipeline.build_graph`), so the network is fully connected and a
change between, say, a tube line and the Overground is modelled as a line change.
"""

BASE_URL: str = "https://api.tfl.gov.uk"
"""Base URL of the TfL Open Data API."""

DEFAULT_TIMEOUT: float = 30.0
"""Default per-request timeout in seconds."""


class TflClient:
    """Minimal client for the TfL route-sequence endpoint.

    Parameters
    ----------
    base_url : str, optional
        Base URL of the TfL API. Defaults to :data:`BASE_URL`.
    app_key : str or None, optional
        TfL application key. Sent as the ``app_key`` query parameter on every
        request to lift rate limits. When ``None`` (the default), the value is
        read from the ``TFL_APP_KEY`` environment variable; if that is also
        unset, requests are made unauthenticated (which works at low volume).
    timeout : float, optional
        Per-request timeout in seconds. Defaults to :data:`DEFAULT_TIMEOUT`.
    client : httpx.Client or None, optional
        An existing :class:`httpx.Client` to use. When provided it is used as
        is and not closed by this object; otherwise one is created internally.
    """

    def __init__(
        self,
        base_url: str = BASE_URL,
        app_key: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.app_key = app_key if app_key is not None else os.environ.get("TFL_APP_KEY")
        self._owns_client = client is None
        self._client = client if client is not None else httpx.Client(timeout=timeout)

    def __enter__(self) -> TflClient:
        """Enter the runtime context and return this client.

        Returns
        -------
        TflClient
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

    def _params(self) -> dict[str, str]:
        """Build query parameters common to every request.

        Returns
        -------
        dict of str to str
            ``{"app_key": ...}`` when an app key is configured, else empty.
        """
        return {"app_key": self.app_key} if self.app_key else {}

    def route_sequence(self, line_id: str, direction: str) -> dict[str, Any]:
        """Fetch the ordered stop sequence for a line in one direction.

        Calls ``GET /Line/{line_id}/Route/Sequence/{direction}``.

        Parameters
        ----------
        line_id : str
            TfL line id, e.g. ``"victoria"``.
        direction : str
            Direction of travel, either ``"inbound"`` or ``"outbound"``.

        Returns
        -------
        dict
            The decoded JSON body. The ``stopPointSequences`` key holds the
            ordered ``stopPoint`` lists that form the line's edges.

        Raises
        ------
        httpx.HTTPStatusError
            If the response status is an error code.
        httpx.HTTPError
            For network/transport-level failures.
        """
        url = f"{self.base_url}/Line/{line_id}/Route/Sequence/{direction}"
        response = self._client.get(url, params=self._params())
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        return data
