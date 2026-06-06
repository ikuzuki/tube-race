"""Tests for the TfL HTTP client. All HTTP is mocked; never hits the network."""

from __future__ import annotations

import httpx
import pytest
import respx

from tube_pipeline.tfl_client import BASE_URL, TUBE_LINE_IDS, TflClient


def test_tube_line_ids_are_the_eleven_lines() -> None:
    """The hardcoded line id list is exactly the 11 tube lines."""
    assert TUBE_LINE_IDS == [
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


@respx.mock
def test_route_sequence_hits_expected_url() -> None:
    """route_sequence calls GET /Line/{id}/Route/Sequence/{direction}."""
    route = respx.get(f"{BASE_URL}/Line/victoria/Route/Sequence/inbound").mock(
        return_value=httpx.Response(200, json={"stopPointSequences": []})
    )
    with TflClient(client=httpx.Client(), app_key=None) as client:
        result = client.route_sequence("victoria", "inbound")
    assert route.called
    assert result == {"stopPointSequences": []}


@respx.mock
def test_app_key_sent_as_query_param_when_provided() -> None:
    """An explicit app key is attached as the ``app_key`` query parameter."""
    route = respx.get(f"{BASE_URL}/Line/central/Route/Sequence/outbound").mock(
        return_value=httpx.Response(200, json={"stopPointSequences": []})
    )
    with TflClient(client=httpx.Client(), app_key="secret-key") as client:
        client.route_sequence("central", "outbound")
    sent = route.calls.last.request
    assert sent.url.params.get("app_key") == "secret-key"


@respx.mock
def test_no_app_key_means_no_query_param() -> None:
    """With no app key configured, no ``app_key`` parameter is sent."""
    route = respx.get(f"{BASE_URL}/Line/jubilee/Route/Sequence/inbound").mock(
        return_value=httpx.Response(200, json={"stopPointSequences": []})
    )
    with TflClient(client=httpx.Client(), app_key=None) as client:
        client.route_sequence("jubilee", "inbound")
    sent = route.calls.last.request
    assert "app_key" not in sent.url.params


@respx.mock
def test_app_key_read_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """An unspecified app key falls back to the TFL_APP_KEY env var."""
    monkeypatch.setenv("TFL_APP_KEY", "env-key")
    route = respx.get(f"{BASE_URL}/Line/district/Route/Sequence/inbound").mock(
        return_value=httpx.Response(200, json={"stopPointSequences": []})
    )
    with TflClient(client=httpx.Client()) as client:
        client.route_sequence("district", "inbound")
    sent = route.calls.last.request
    assert sent.url.params.get("app_key") == "env-key"


@respx.mock
def test_route_sequence_raises_for_status() -> None:
    """A non-2xx response raises an HTTPStatusError."""
    respx.get(f"{BASE_URL}/Line/victoria/Route/Sequence/inbound").mock(
        return_value=httpx.Response(429, json={"message": "rate limited"})
    )
    with TflClient(client=httpx.Client(), app_key=None) as client:  # noqa: SIM117
        with pytest.raises(httpx.HTTPStatusError):
            client.route_sequence("victoria", "inbound")
