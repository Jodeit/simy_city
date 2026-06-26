"""simy_city — SimCity-style parcel & infrastructure-dependency analysis on public data.

This package is intentionally thin at this milestone (the public-data source
registry). The first concrete code is the registry loader/validator, which makes
``data_sources/registry.yaml`` and ``layers.yaml`` queryable so that:

  * the dependency engine can ask "which sources feed the `power` layer?", and
  * contributor automation can ask "which connectors still have status `none`?".
"""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("simy_city")
except PackageNotFoundError:  # running from a source checkout without install
    __version__ = "0.1.0"

from .registry import Layer, Registry, Source, load_registry  # noqa: E402

__all__ = ["Registry", "Source", "Layer", "load_registry", "__version__"]
