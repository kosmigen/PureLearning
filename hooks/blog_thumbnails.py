"""Generate WebP thumbnails for the footer's recent posts."""

from hashlib import blake2s
from http.client import HTTPException
from io import BytesIO
import logging
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen

from mkdocs.structure.files import File
from PIL import Image, ImageOps


_THUMBNAIL_SIZE = (112, 112)
_MAX_DOWNLOAD = 20 * 1024 * 1024
log = logging.getLogger("mkdocs.hooks.blog_thumbnails")


def _resize(data):
    output = BytesIO()
    with Image.open(BytesIO(data)) as original:
        ImageOps.exif_transpose(original, in_place=True)
        thumbnail = ImageOps.fit(original.convert("RGBA"), _THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
        thumbnail.save(output, format="WEBP", quality=80)
    return output.getvalue()


def _remote_thumbnail(image, config):
    """Download and resize a remote cover, reusing the generated WebP from
    .cache/blog-thumbnails/ so later builds skip the network entirely."""
    key = blake2s(image.encode(), digest_size=8).hexdigest()
    cache = Path(config.config_file_path).parent / ".cache" / "blog-thumbnails" / f"{key}.webp"
    if cache.is_file():
        return cache.read_bytes()

    with urlopen(image, timeout=5) as response:
        data = response.read(_MAX_DOWNLOAD + 1)
    if len(data) > _MAX_DOWNLOAD:
        return None

    content = _resize(data)
    cache.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=cache.parent, delete=False) as temporary:
        temporary.write(content)
        Path(temporary.name).replace(cache)
    return content


def _thumbnail_url(post, config, files):
    if thumbnail := post.meta.get("thumbnail"):
        return thumbnail

    image = post.meta.get("image")
    if not image:
        return None

    fallback = image
    try:
        url = urlsplit(image)
        if url.scheme in {"http", "https"} or (not url.scheme and url.netloc):
            content = _remote_thumbnail(image if url.scheme else f"https:{image}", config)
            if content is None:
                return fallback
        elif url.scheme:
            return fallback
        else:
            source = files.get_file_from_path(unquote(url.path).lstrip("/"))
            if source is None or not source.inclusion.is_included():
                return None
            fallback = url._replace(path=source.url).geturl()
            content = _resize(source.content_bytes)
    except (OSError, HTTPException, ValueError, Image.DecompressionBombError) as error:
        if isinstance(error, HTTPError):
            error.close()
        log.info("%s: 无法生成页脚缩略图，使用封面图片（%s）", post.file.src_uri, error)
        return fallback

    digest = blake2s(content, digest_size=8).hexdigest()
    path = f"assets/images/blog/thumbnails/auto-{digest}.webp"
    if files.get_file_from_path(path) is None:
        files.append(File.generated(config, path, content=content))
    return path


def on_env(env, *, config, files):
    """Prepare thumbnails once before MkDocs copies assets and renders pages."""
    blog = config.plugins.get("material/blog")
    posts = sorted(
        (post for post in blog.blog.posts if not post.config.draft),
        key=lambda post: post.config.date.created,
        reverse=True,
    )[:3] if blog and blog.config.enabled else []
    env.globals["footer_recent_posts"] = [
        (post, _thumbnail_url(post, config, files)) for post in posts
    ]
    return env
