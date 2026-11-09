"""Load pinned Lucide SVG assets directly from the build dependency."""

from pathlib import Path

from jinja2 import ChoiceLoader, FileSystemLoader, PrefixLoader
from mkdocs.exceptions import ConfigurationError
from mkdocs.plugins import event_priority
from mkdocs.structure.files import File


def _package_root(config):
    root = Path(config.config_file_path).parent / "node_modules" / "lucide-static"
    if not (root / "icons").is_dir():
        raise ConfigurationError(
            "缺少 Lucide 图标库，请先在项目根目录运行 npm ci --ignore-scripts。"
        )
    return root


def on_files(files, *, config):
    files.append(File.generated(
        config, "assets/licenses/lucide.txt",
        abs_src_path=str(_package_root(config) / "LICENSE"),
    ))


@event_priority(100)
def on_env(env, *, config, files):
    lucide = FileSystemLoader(_package_root(config) / "icons")
    # Preserve project overrides and theme icons; resolve Lucide includes from
    # the package without copying its full library into the generated website.
    env.loader = ChoiceLoader([
        env.loader,
        PrefixLoader({".icons": PrefixLoader({"lucide": lucide})}),
    ])
