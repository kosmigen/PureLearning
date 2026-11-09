"""Check package loading without giving up project and theme overrides."""

from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

from jinja2 import DictLoader, Environment
from mkdocs.exceptions import ConfigurationError

from hooks.icon_assets import on_env


class IconAssetTests(unittest.TestCase):
    def setUp(self):
        self.repository = Path(__file__).resolve().parents[1]
        self.config = SimpleNamespace(config_file_path=self.repository / "mkdocs.yml")

    def test_package_provides_icons_that_have_no_project_svg(self):
        env = Environment(loader=DictLoader({"existing.html": "existing template"}))
        on_env(env, config=self.config, files=None)
        self.assertIn('class="lucide lucide-rocket"',
                      env.get_template(".icons/lucide/rocket.svg").render())
        self.assertEqual(env.get_template("existing.html").render(), "existing template")
        self.assertFalse((self.repository / "overrides/.icons/lucide/rocket.svg").exists())

    def test_project_icon_override_still_takes_precedence(self):
        env = Environment(loader=DictLoader({".icons/lucide/rocket.svg": "custom icon"}))
        on_env(env, config=self.config, files=None)
        self.assertEqual(env.get_template(".icons/lucide/rocket.svg").render(), "custom icon")

    def test_missing_dependency_explains_the_install_command(self):
        with tempfile.TemporaryDirectory() as temporary:
            config = SimpleNamespace(config_file_path=Path(temporary) / "mkdocs.yml")
            with self.assertRaisesRegex(ConfigurationError, "npm ci --ignore-scripts"):
                on_env(Environment(loader=DictLoader({})), config=config, files=None)
